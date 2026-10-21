import { NextRequest, NextResponse } from 'next/server';
import { requireAdvisor } from '@/lib/auth/session';
import { ApiError, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin } from '@/lib/auth/http';
import { ownedReport, privateReportLink } from '@/lib/reports/service';

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    const body = await jsonBody(request);
    requireCsrf(session.csrfToken, body.csrfToken);
    const { id } = await ctx.params;
    const report = await ownedReport(id, session.advisor.id);
    if (report.status !== 'READY') throw new ApiError(409, 'Report is not ready.');
    return noStore(NextResponse.json({ downloadUrl: privateReportLink(id, session.sessionId), expiresIn: 600 }));
  } catch (error) { return errorResponse(error); }
}
