import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createEnrollment, enrollmentForSecret, generateRecoveryCodes, hashRecoveryCodes, verifyTotp } from '@/lib/auth/totp';
import { encryptText } from '@/lib/auth/crypto';
import { consumeChallenge, createAdvisorSessionFromChallenge, requireChallenge } from '@/lib/auth/session';
import { ADVISOR_COOKIE, ApiError, CHALLENGE_COOKIE, clearSessionCookie, clientRateLimitKey, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin, setSessionCookie } from '@/lib/auth/http';
import { enforceRateLimit } from '@/lib/auth/rate-limit';

async function enforceEnrollmentAttemptLimit(request: NextRequest, challengeId: string): Promise<void> {
  try {
    await enforceRateLimit('mfa-enroll-challenge', challengeId, 5, 10 * 60_000);
    await enforceRateLimit('mfa-enroll-ip', clientRateLimitKey(request), 30, 10 * 60_000);
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) await consumeChallenge(challengeId);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { challenge } = await requireChallenge(request);
    if (challenge.advisor.totpEnabledAt) throw new ApiError(409, 'Two-factor authentication is already enrolled.');
    let encryptedSecret = challenge.encryptedEnrollmentSecret;
    let enrollment: Awaited<ReturnType<typeof createEnrollment>>;
    if (encryptedSecret) {
      // Reconstruct the URI/QR from the stored encrypted secret without issuing a different secret on refresh.
      const { decryptText } = await import('@/lib/auth/crypto');
      enrollment = await enrollmentForSecret(decryptText(encryptedSecret), challenge.advisor.email);
    } else {
      enrollment = await createEnrollment(challenge.advisor.email);
      encryptedSecret = encryptText(enrollment.secret);
      await db.authChallenge.update({ where: { id: challenge.id }, data: { encryptedEnrollmentSecret: encryptedSecret } });
    }
    return noStore(NextResponse.json({ secret: enrollment.secret, uri: enrollment.uri, qrDataUrl: enrollment.qrDataUrl, csrfToken: challenge.csrfToken }));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    requireTrustedOrigin(request);
    const body = await jsonBody(request);
    const { challenge } = await requireChallenge(request);
    requireCsrf(challenge.csrfToken, body.csrfToken);
    const code = typeof body.code === 'string' ? body.code : '';
    await enforceEnrollmentAttemptLimit(request, challenge.id);
    if (!challenge.encryptedEnrollmentSecret || !verifyTotp(challenge.encryptedEnrollmentSecret, challenge.advisor.email, code)) throw new ApiError(400, 'Invalid authentication code.');
    const recoveryCodes = generateRecoveryCodes();
    const hashes = await hashRecoveryCodes(recoveryCodes);
    const session = await createAdvisorSessionFromChallenge(challenge.id, challenge.advisorId, {
      enrollment: { encryptedSecret: challenge.encryptedEnrollmentSecret, recoveryCodeHashes: JSON.stringify(hashes) },
    });
    if (!session) throw new ApiError(401, 'Your verification has expired.');
    const response = NextResponse.json({ ok: true, recoveryCodes });
    setSessionCookie(response, request, ADVISOR_COOKIE, session.token);
    clearSessionCookie(response, request, CHALLENGE_COOKIE);
    return noStore(response);
  } catch (error) { return errorResponse(error); }
}
