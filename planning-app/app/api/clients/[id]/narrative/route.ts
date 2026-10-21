import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdvisor } from '@/lib/auth/session';
import { ApiError, clientRateLimitKey, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin } from '@/lib/auth/http';
import { enforceRateLimit } from '@/lib/auth/rate-limit';
import { generateNarrative, getNarrative, saveNarrativeDraft } from '@/lib/narrative/service';

export const maxDuration = 30;
const scenarioSchema = z.string().trim().min(1).max(191).nullable().optional();
const revisionSchema = z.number().int().min(0).max(2_147_483_647);
const generateSchema = z.object({ analysisId: z.string().trim().min(1).max(191), scenarioId: scenarioSchema, revision: revisionSchema, requestOptionalAi: z.boolean().optional().default(false), dataSharingApproved: z.boolean().optional().default(false), csrfToken: z.string() }).strict();
const saveSchema = z.object({ analysisId: z.string().trim().min(1).max(191), scenarioId: scenarioSchema, revision: revisionSchema, letter: z.string().max(5_000), sections: z.record(z.string().max(2_000)), csrfToken: z.string() }).strict();

function queryScenario(request: NextRequest): string | undefined {
  const raw = request.nextUrl.searchParams.get('scenarioId');
  if (!raw) return undefined;
  const parsed = scenarioSchema.safeParse(raw);
  if (!parsed.success || !parsed.data) throw new ApiError(422, 'Choose a valid scenario.');
  return parsed.data;
}

async function mutationThrottle(request: NextRequest, advisorId: string, action: string): Promise<void> {
  await enforceRateLimit(`narrative-${action}`, `${advisorId}:${clientRateLimitKey(request)}`, action === 'generate' ? 12 : 40, 60 * 60_000);
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdvisor(request);
    const { id } = await ctx.params;
    const result = await getNarrative(id, session.advisor.id, queryScenario(request));
    return noStore(NextResponse.json({ ...result, csrfToken: session.csrfToken }));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    await mutationThrottle(request, session.advisor.id, 'generate');
    const body = generateSchema.safeParse(await jsonBody(request));
    if (!body.success) throw new ApiError(422, 'Check the narrative generation request.');
    requireCsrf(session.csrfToken, body.data.csrfToken);
    const { id } = await ctx.params;
    const result = await generateNarrative(id, session.advisor.id, body.data);
    return noStore(NextResponse.json({ ...result, csrfToken: session.csrfToken }));
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    await mutationThrottle(request, session.advisor.id, 'save');
    const body = saveSchema.safeParse(await jsonBody(request));
    if (!body.success) throw new ApiError(422, 'Check the narrative text and revision.');
    requireCsrf(session.csrfToken, body.data.csrfToken);
    const { id } = await ctx.params;
    const result = await saveNarrativeDraft(id, session.advisor.id, body.data);
    return noStore(NextResponse.json({ ...result, csrfToken: session.csrfToken }));
  } catch (error) { return errorResponse(error); }
}
