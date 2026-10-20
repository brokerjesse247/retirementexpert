import { NextRequest, NextResponse } from 'next/server';
import { ADVISOR_COOKIE, clearSessionCookie, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin } from '@/lib/auth/http';
import { requireAdvisor, revokeAdvisorSession } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    const body = await jsonBody(request);
    requireCsrf(session.csrfToken, body.csrfToken);
    await revokeAdvisorSession(request);
    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response, request, ADVISOR_COOKIE);
    return noStore(response);
  } catch (error) { return errorResponse(error); }
}
