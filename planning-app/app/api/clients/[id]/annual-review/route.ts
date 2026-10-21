import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdvisor } from '@/lib/auth/session';
import { ApiError, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin } from '@/lib/auth/http';
import { annualReviewStatus, presentReport, requestAnnualUpdate, setReviewDate, startImplementation } from '@/lib/annual-review/service';
import { enforceRateLimit } from '@/lib/auth/rate-limit';

type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAdvisor(request);
    const { id } = await context.params;
    return noStore(NextResponse.json({ ...await annualReviewStatus(id, session.advisor.id), csrfToken: session.csrfToken }));
  } catch (error) { return errorResponse(error); }
}
const base = { revision: z.number().int().positive(), csrfToken: z.string() };
const schema = z.discriminatedUnion('action', [
  z.object({ ...base, action: z.literal('PRESENT'), reportId: z.string().min(1).max(191), reviewDate: z.string().max(10) }).strict(),
  z.object({ ...base, action: z.literal('SET_DATE'), reviewDate: z.string().max(10) }).strict(),
  z.object({ ...base, action: z.literal('REQUEST_UPDATE') }).strict(),
  z.object({ ...base, action: z.literal('START_IMPLEMENTATION') }).strict(),
]);
export async function POST(request: NextRequest, context: Context) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    const { id } = await context.params;
    const parsed = schema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApiError(422, 'Choose a valid review action and reload the current client revision.');
    requireCsrf(session.csrfToken, parsed.data.csrfToken);
    await enforceRateLimit('annual-review-actions', session.advisor.id, 30, 3600000);
    const body = parsed.data;
    const result = body.action === 'PRESENT' ? await presentReport(id, session.advisor.id, body.reportId, body.reviewDate, body.revision) : body.action === 'SET_DATE' ? await setReviewDate(id, session.advisor.id, body.reviewDate, body.revision) : body.action === 'START_IMPLEMENTATION' ? await startImplementation(id, session.advisor.id, body.revision) : await requestAnnualUpdate(id, session.advisor.id, body.revision);
    return noStore(NextResponse.json({ ok: true, result, ...await annualReviewStatus(id, session.advisor.id), csrfToken: session.csrfToken }));
  } catch (error) { return errorResponse(error); }
}
