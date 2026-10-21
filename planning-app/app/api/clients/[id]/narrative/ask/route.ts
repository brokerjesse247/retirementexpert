import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdvisor } from '@/lib/auth/session';
import { ApiError, clientRateLimitKey, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin } from '@/lib/auth/http';
import { enforceRateLimit } from '@/lib/auth/rate-limit';
import { askNarrativeResults } from '@/lib/narrative/service';

const bodySchema = z.object({ analysisId: z.string().trim().min(1).max(191), scenarioId: z.string().trim().min(1).max(191).nullable().optional(), query: z.string().trim().min(3).max(280), csrfToken: z.string() }).strict();
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    await enforceRateLimit('narrative-results-lookup', `${session.advisor.id}:${clientRateLimitKey(request)}`, 30, 60 * 60_000);
    const body = bodySchema.safeParse(await jsonBody(request));
    if (!body.success) throw new ApiError(422, 'Ask a short, valid results question.');
    requireCsrf(session.csrfToken, body.data.csrfToken);
    const { id } = await ctx.params;
    return noStore(NextResponse.json({ ...await askNarrativeResults(id, session.advisor.id, body.data), csrfToken: session.csrfToken }));
  } catch (error) { return errorResponse(error); }
}
