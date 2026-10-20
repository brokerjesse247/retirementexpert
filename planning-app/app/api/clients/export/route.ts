import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse } from '@/lib/auth/http';
import { requireAdvisor } from '@/lib/auth/session';
import { clientStatus, clientWhere, csvValue } from '@/lib/services/clients';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdvisor(request);
    const search = request.nextUrl.searchParams.get('search')?.trim().slice(0, 120) ?? '';
    const statusParam = request.nextUrl.searchParams.get('status');
    const status = clientStatus(statusParam);
    if (statusParam && !status) return NextResponse.json({ error: 'Invalid client status.' }, { status: 400 });
    const clients = await db.client.findMany({ where: clientWhere(session.advisor.id, search, status), orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], select: { firstName: true, lastName: true, email: true, status: true, submittedAt: true, updatedAt: true, nextReviewDate: true } });
    const rows = [['First name', 'Last name', 'Email', 'Status', 'Submitted at', 'Updated at', 'Next review date'], ...clients.map((client) => [client.firstName, client.lastName, client.email, client.status, client.submittedAt, client.updatedAt, client.nextReviewDate].map(csvValue))];
    const csv = `${rows.map((row, index) => index === 0 ? row.map(csvValue).join(',') : row.join(',')).join('\r\n')}\r\n`;
    return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="retirement-clients.csv"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return errorResponse(error); }
}
