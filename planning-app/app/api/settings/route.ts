import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ApiError, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin, setSessionCookie } from '@/lib/auth/http';
import { requireAdvisor } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdvisor(request);
    const response = NextResponse.json({ advisor: { name: session.advisor.name, email: session.advisor.email, phone: session.advisor.phone, licenseNumbers: session.advisor.licenseNumbers }, csrfToken: session.csrfToken, authMode: 'PASSWORD', twoFactorEnabled: false });
    setSessionCookie(response, request, 'rp_advisor_session', request.cookies.get('rp_advisor_session')!.value);
    return noStore(response);
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    const body = await jsonBody(request);
    requireCsrf(session.csrfToken, body.csrfToken);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const licenseNumbers = typeof body.licenseNumbers === 'string' ? body.licenseNumbers.trim() : '';
    if (!name || name.length > 200 || phone.length > 64 || licenseNumbers.length > 10_000) throw new ApiError(422, 'Please correct the highlighted fields.', { name: 'A valid name is required.' });
    await db.advisor.update({ where: { id: session.advisor.id }, data: { name, phone: phone || null, licenseNumbers: licenseNumbers || null } });
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, request, 'rp_advisor_session', request.cookies.get('rp_advisor_session')!.value);
    return noStore(response);
  } catch (error) { return errorResponse(error); }
}
