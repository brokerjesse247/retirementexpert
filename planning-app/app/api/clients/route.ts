import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, noStore, setSessionCookie } from '@/lib/auth/http';
import { requireAdvisor } from '@/lib/auth/session';
import { ageFromDob, clientStatus, clientWhere } from '@/lib/services/clients';
import { decryptJson } from '@/lib/auth/crypto';
import { savedClientMetrics } from '@/lib/services/client-metrics';
import { loadAssumptions } from '@/lib/assumptions/service';
import { ENGINE_VERSION } from '@/lib/calculations/engine';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdvisor(request);
    const search = request.nextUrl.searchParams.get('search')?.trim().slice(0, 120) ?? '';
    const statusParam = request.nextUrl.searchParams.get('status');
    const status = clientStatus(statusParam);
    if (statusParam && !status) return noStore(NextResponse.json({ error: 'Invalid client status.' }, { status: 400 }));
    const sort = request.nextUrl.searchParams.get('sort') ?? 'updatedAt_desc';
    if (!['updatedAt_desc', 'name_asc', 'submittedAt_asc', 'submittedAt_desc'].includes(sort)) return noStore(NextResponse.json({ error: 'Invalid client sort.' }, { status: 400 }));
    const orderBy = sort === 'name_asc' ? [{ lastName: 'asc' as const }, { firstName: 'asc' as const }] : sort === 'submittedAt_asc' ? [{ submittedAt: 'asc' as const }] : sort === 'submittedAt_desc' ? [{ submittedAt: 'desc' as const }] : [{ updatedAt: 'desc' as const }];
    const where = clientWhere(session.advisor.id, search, status);
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const due = new Date(now.getTime() + 30 * 24 * 60 * 60_000);
    const assumptions = await loadAssumptions(session.advisor.id);
    const [clients, newIntakes, inReview, reportsThisMonth, reviewsDue] = await Promise.all([
      db.client.findMany({ where, orderBy, select: { id: true, revision: true, firstName: true, lastName: true, email: true, status: true, submittedAt: true, updatedAt: true, nextReviewDate: true, persons: { where: { role: 'PRIMARY' }, select: { dob: true } }, scenarios: { where: { isBase: true, status: 'DRAFT' }, select: { analysisResults: { take: 1, orderBy: { createdAt: 'desc' }, select: { encryptedSnapshot: true } } } } } }),
      db.client.count({ where: { advisorId: session.advisor.id, status: 'NEW', submittedAt: { gte: sevenDaysAgo } } }),
      db.client.count({ where: { advisorId: session.advisor.id, status: 'IN_REVIEW' } }),
      db.report.count({ where: { client: { advisorId: session.advisor.id }, status: 'READY', completedAt: { gte: monthStart } } }),
      db.client.count({ where: { advisorId: session.advisor.id, nextReviewDate: { gte: now, lte: due } } }),
    ]);
    const response = NextResponse.json({
      clients: clients.map((client) => {
        const source = client.scenarios[0]?.analysisResults[0];
        const metrics = savedClientMetrics(source ? decryptJson<unknown>(source.encryptedSnapshot) : null, client.revision, assumptions.version, ENGINE_VERSION);
        return { id: client.id, name: `${client.firstName} ${client.lastName}`.trim(), email: client.email, age: ageFromDob(client.persons[0]?.dob), submittedAt: client.submittedAt, status: client.status, updatedAt: client.updatedAt, nextReviewDate: client.nextReviewDate?.toISOString() ?? null, ...metrics };
      }),
      kpis: { newIntakes, inReview, reportsThisMonth, reviewsDue },
    });
    setSessionCookie(response, request, 'rp_advisor_session', request.cookies.get('rp_advisor_session')!.value);
    return noStore(response);
  } catch (error) { return errorResponse(error); }
}
