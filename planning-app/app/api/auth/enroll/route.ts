import { NextRequest, NextResponse } from 'next/server';
import { CHALLENGE_COOKIE, clearSessionCookie, noStore } from '@/lib/auth/http';

function disabled(request: NextRequest) {
  const response = NextResponse.json({ error: 'Authenticator setup has been removed. Refresh the login page and sign in with your email and password.' }, { status: 410 });
  clearSessionCookie(response, request, CHALLENGE_COOKIE);
  return noStore(response);
}
export async function GET(request: NextRequest) { return disabled(request); }
export async function POST(request: NextRequest) { return disabled(request); }
