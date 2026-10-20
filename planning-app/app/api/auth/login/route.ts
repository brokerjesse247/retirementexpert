import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createChallenge } from '@/lib/auth/session';
import { CHALLENGE_COOKIE, ApiError, clientRateLimitKey, errorResponse, jsonBody, noStore, requireTrustedOrigin, setSessionCookie } from '@/lib/auth/http';
import { enforceRateLimit } from '@/lib/auth/rate-limit';

export async function POST(request: NextRequest) {
  try {
    requireTrustedOrigin(request);
    const body = await jsonBody(request);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) throw new ApiError(400, 'Email and password are required.');
    await enforceRateLimit('login-email', email, 5, 15 * 60_000);
    await enforceRateLimit('login-ip', clientRateLimitKey(request), 30, 15 * 60_000);
    const advisor = await db.advisor.findUnique({ where: { email } });
    if (!advisor || !(await bcrypt.compare(password, advisor.passwordHash))) throw new ApiError(401, 'Invalid email or password.');
    const challenge = await createChallenge(advisor.id);
    const response = NextResponse.json({ requiresTwoFactor: true, enrollmentRequired: !advisor.totpEnabledAt, csrfToken: challenge.csrfToken });
    setSessionCookie(response, request, CHALLENGE_COOKIE, challenge.token);
    return noStore(response);
  } catch (error) { return errorResponse(error); }
}
