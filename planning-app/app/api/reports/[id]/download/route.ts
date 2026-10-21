import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdvisor } from '@/lib/auth/session';
import { errorResponse, noStore } from '@/lib/auth/http';
import { reportPdfBytes, verifyReportGrant } from '@/lib/reports/service';

export const runtime = 'nodejs';
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdvisor(request);
    const { id } = await ctx.params;
    verifyReportGrant(request.nextUrl.searchParams.get('grant') ?? '', id, session.sessionId);
    const { bytes, version, clientId } = await reportPdfBytes(id, session.advisor.id);
    await db.auditLog.create({ data: { advisorId: session.advisor.id, clientId, action: 'REPORT_DOWNLOADED', entity: 'Report', entityId: id, summary: `Advisor downloaded private version ${version}.` } });
    return noStore(new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="RetirementExpert-Report-v${version}.pdf"`, 'X-Content-Type-Options': 'nosniff' } }));
  } catch (error) { return errorResponse(error); }
}
