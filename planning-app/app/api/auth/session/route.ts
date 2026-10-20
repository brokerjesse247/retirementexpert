import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, noStore, setSessionCookie } from '@/lib/auth/http';
import { getAdvisorSession } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  try {
    const session = await getAdvisorSession(request);
    const response = NextResponse.json({
      advisor: session ? { id: session.advisor.id, name: session.advisor.name, email: session.advisor.email } : null,
      csrfToken: session?.csrfToken ?? null,
      authMode: 'PASSWORD',
      twoFactorEnabled: false,
    });
    if (session) setSessionCookie(response, request, 'rp_advisor_session', request.cookies.get('rp_advisor_session')!.value);
    return noStore(response);
  } catch (error) { return errorResponse(error); }
}
