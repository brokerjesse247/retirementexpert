import { NextRequest, NextResponse } from 'next/server';
import { ADVISOR_COOKIE, ApiError, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin, setSessionCookie } from '@/lib/auth/http';
import { renewAdvisorSession, requireAdvisor } from '@/lib/auth/session';

/**
 * The UI calls this only after throttled, user-originated pointer/keyboard
 * activity. GET validation never extends the server-side idle deadline.
 */
export async function POST(request: NextRequest) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    const body = await jsonBody(request);
    requireCsrf(session.csrfToken, body.csrfToken);
    if (!await renewAdvisorSession(session.sessionId)) throw new ApiError(401, 'Authentication is required.');
    const token = request.cookies.get(ADVISOR_COOKIE)?.value;
    if (!token) throw new ApiError(401, 'Authentication is required.');
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, request, ADVISOR_COOKIE, token);
    return noStore(response);
  } catch (error) { return errorResponse(error); }
}
