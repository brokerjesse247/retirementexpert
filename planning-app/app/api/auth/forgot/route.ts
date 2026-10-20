import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { appOrigin, clientRateLimitKey, errorResponse, jsonBody, noStore, requireTrustedOrigin } from '@/lib/auth/http';
import { enforceRateLimit } from '@/lib/auth/rate-limit';
import { randomToken, tokenHash } from '@/lib/auth/crypto';
import { queueEmail } from '@/lib/services/email';

export async function POST(request: NextRequest) {
  try {
    requireTrustedOrigin(request);
    const body = await jsonBody(request);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    // Always return the same response, including malformed/unknown email, to avoid enumeration.
    if (email) await enforceRateLimit('forgot-email', email, 3, 60 * 60_000);
    await enforceRateLimit('forgot-ip', clientRateLimitKey(request), 12, 60 * 60_000);
    const advisor = email ? await db.advisor.findUnique({ where: { email } }) : null;
    if (advisor) {
      const token = randomToken();
      await db.passwordResetToken.updateMany({ where: { advisorId: advisor.id, usedAt: null }, data: { usedAt: new Date() } });
      await db.passwordResetToken.create({ data: { advisorId: advisor.id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 60 * 60_000) } });
      try {
        const link = `${appOrigin()}/reset-password#token=${token}`;
        await queueEmail({
          to: advisor.email, displayName: 'LSRT Insurance', subject: 'Reset your LSRT planning password',
          text: `Use this one-time link to reset your password: ${link}`,
          html: `<p>Use this one-time link to reset your password:</p><p><a href="${link}">Reset password</a></p>`,
        }, 'PASSWORD_RESET', advisor.id);
      } catch {
        // Generic response remains intentional; no reset link or provider failure is exposed.
      }
    }
    return noStore(NextResponse.json({ ok: true }));
  } catch (error) { return errorResponse(error); }
}
