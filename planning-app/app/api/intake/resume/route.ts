import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { appOrigin, ApiError, clientRateLimitKey, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin } from '@/lib/auth/http';
import { randomToken, tokenHash } from '@/lib/auth/crypto';
import { requireDraft } from '@/lib/services/drafts';
import { queueEmail } from '@/lib/services/email';
import { enforceRateLimit } from '@/lib/auth/rate-limit';

const generic = { delivery: 'queued' as const, message: 'If the email matches this saved intake, a secure resume link has been queued.' };

export async function POST(request: NextRequest) {
  try {
    requireTrustedOrigin(request);
    const context = await requireDraft(request);
    const body = await jsonBody(request);
    requireCsrf(context.draft.csrfToken, body.csrfToken);
    await enforceRateLimit('intake-resume-issue-ip', clientRateLimitKey(request), 8, 60 * 60_000);
    await enforceRateLimit('intake-resume-issue-draft', context.draft.id, 3, 60 * 60_000);
    const requested = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const saved = context.draft.email ?? (typeof context.data.email === 'string' ? context.data.email.trim().toLowerCase() : '');
    if (!requested || !saved || requested !== saved || context.draft.submittedAt) return noStore(NextResponse.json(generic));
    const token = randomToken();
    const grant = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const now = new Date();
      await tx.draftAccessGrant.updateMany({ where: { draftId: context.draft.id, usedAt: null, revokedAt: null }, data: { revokedAt: now } });
      return tx.draftAccessGrant.create({ data: { draftId: context.draft.id, tokenHash: tokenHash(token), expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60_000) } });
    });
    try {
      const link = `${appOrigin()}/intake/resume#token=${token}`;
      await queueEmail({
        to: saved, displayName: 'LSRT Insurance', subject: 'Resume your retirement planning intake',
        text: `Resume your saved intake with this secure one-time link: ${link}`,
        html: `<p>Resume your saved intake with this secure one-time link:</p><p><a href="${link}">Resume intake</a></p>`,
      }, 'INTAKE_RESUME');
      return noStore(NextResponse.json(generic));
    } catch {
      // Do not leave a usable resume link when its email could not be queued.
      await db.draftAccessGrant.updateMany({ where: { id: grant.id, revokedAt: null }, data: { revokedAt: new Date() } });
      return noStore(NextResponse.json({ delivery: 'failed', message: 'We could not queue a resume email. Please try again later.' }));
    }
  } catch (error) { return errorResponse(error); }
}
