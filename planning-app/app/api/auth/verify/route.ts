import { NextRequest, NextResponse } from 'next/server';
import { consumeRecoveryCode, verifyTotp } from '@/lib/auth/totp';
import { consumeChallenge, createAdvisorSessionFromChallenge, requireChallenge } from '@/lib/auth/session';
import { ADVISOR_COOKIE, CHALLENGE_COOKIE, ApiError, clearSessionCookie, clientRateLimitKey, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin, setSessionCookie } from '@/lib/auth/http';
import { enforceRateLimit } from '@/lib/auth/rate-limit';

async function enforceMfaAttemptLimit(request: NextRequest, challengeId: string): Promise<void> {
  try {
    await enforceRateLimit('mfa-verify-challenge', challengeId, 5, 10 * 60_000);
    await enforceRateLimit('mfa-verify-ip', clientRateLimitKey(request), 30, 10 * 60_000);
  } catch (error) {
    // A challenge that reached either cap cannot be used to continue guessing.
    if (error instanceof ApiError && error.status === 429) await consumeChallenge(challengeId);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    requireTrustedOrigin(request);
    const body = await jsonBody(request);
    const { challenge } = await requireChallenge(request);
    requireCsrf(challenge.csrfToken, body.csrfToken);
    const code = typeof body.code === 'string' ? body.code : '';
    await enforceMfaAttemptLimit(request, challenge.id);
    const encrypted = challenge.advisor.totpSecretEncrypted;
    if (!encrypted) throw new ApiError(409, 'Two-factor enrollment is required.');
    let recoveryUpdate: { expectedSerialized: string; remainingSerialized: string } | undefined;
    let accepted = verifyTotp(encrypted, challenge.advisor.email, code);
    if (!accepted && challenge.advisor.recoveryCodeHashes) {
      const recovery = await consumeRecoveryCode(challenge.advisor.recoveryCodeHashes, code);
      accepted = recovery.ok;
      if (accepted) recoveryUpdate = { expectedSerialized: challenge.advisor.recoveryCodeHashes, remainingSerialized: JSON.stringify(recovery.remaining) };
    }
    if (!accepted) throw new ApiError(401, 'Invalid authentication code.');
    const session = await createAdvisorSessionFromChallenge(challenge.id, challenge.advisorId, recoveryUpdate ? { recovery: recoveryUpdate } : {});
    if (!session) throw new ApiError(401, 'Your verification has expired.');
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, request, ADVISOR_COOKIE, session.token);
    clearSessionCookie(response, request, CHALLENGE_COOKIE);
    return noStore(response);
  } catch (error) { return errorResponse(error); }
}
