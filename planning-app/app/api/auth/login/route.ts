import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createAdvisorSession } from '@/lib/auth/session';
import { ADVISOR_COOKIE, CHALLENGE_COOKIE, ApiError, clearSessionCookie, clientRateLimitKey, errorResponse, jsonBody, noStore, requireTrustedOrigin, setSessionCookie } from '@/lib/auth/http';
import { enforceRateLimit } from '@/lib/auth/rate-limit';

export async function POST(request: NextRequest) {
  try {
    requireTrustedOrigin(request);
    const body = await jsonBody(request);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) throw new ApiError(400, 'Email and password are required.');
    if (email.length > 320 || password.length > 200) throw new ApiError(401, 'Invalid email or password.');
    await enforceRateLimit('login-email', email, 5, 15 * 60_000);
    await enforceRateLimit('login-ip', clientRateLimitKey(request), 30, 15 * 60_000);
    const advisor = await db.advisor.findUnique({ where: { email } });
    if (!advisor || !(await bcrypt.compare(password, advisor.passwordHash))) throw new ApiError(401, 'Invalid email or password.');
    const session = await createAdvisorSession(advisor.id);
    const response = NextResponse.json({ ok: true, authMode: 'PASSWORD', advisor: { id: advisor.id, name: advisor.name, email: advisor.email }, csrfToken: session.csrfToken });
    clearSessionCookie(response, request, CHALLENGE_COOKIE);
    setSessionCookie(response, request, ADVISOR_COOKIE, session.token);
    return noStore(response);
  } catch (error) { return errorResponse(error); }
}
