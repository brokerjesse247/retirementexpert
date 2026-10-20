import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { randomToken, tokenHash } from '@/lib/auth/crypto';
import { clientRateLimitKey, DRAFT_COOKIE, ApiError, errorResponse, jsonBody, noStore, requireTrustedOrigin, setSessionCookie } from '@/lib/auth/http';
import { enforceRateLimit } from '@/lib/auth/rate-limit';

export async function POST(request: NextRequest) {
  try {
    requireTrustedOrigin(request);
    const body = await jsonBody(request);
    const token = typeof body.token === 'string' ? body.token : '';
    if (!token) throw new ApiError(400, 'Invalid or expired resume link.');
    await enforceRateLimit('intake-resume-exchange-ip', clientRateLimitKey(request), 15, 60 * 60_000);
    const grant = await db.draftAccessGrant.findUnique({ where: { tokenHash: tokenHash(token) } });
    if (!grant || grant.usedAt || grant.revokedAt || grant.expiresAt <= new Date()) throw new ApiError(400, 'Invalid or expired resume link.');
    await enforceRateLimit('intake-resume-exchange-draft', grant.draftId, 5, 60 * 60_000);
    const newToken = randomToken();
    const consumed = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const now = new Date();
      const claim = await tx.draftAccessGrant.updateMany({ where: { id: grant.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (!claim.count) return false;
      // `submittedAt: null` prevents a stale link from restoring a submitted
      // intake even if submission races this exchange.
      const draft = await tx.intakeDraft.updateMany({
        where: { id: grant.draftId, submittedAt: null },
        data: { sessionTokenHash: tokenHash(newToken), csrfToken: randomToken() },
      });
      if (!draft.count) return false;
      await tx.draftAccessGrant.updateMany({
        where: { draftId: grant.draftId, id: { not: grant.id }, revokedAt: null },
        data: { revokedAt: now },
      });
      return true;
    });
    if (!consumed) throw new ApiError(400, 'Invalid or expired resume link.');
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, request, DRAFT_COOKIE, newToken);
    return noStore(response);
  } catch (error) { return errorResponse(error); }
}
