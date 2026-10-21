import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdvisor } from '@/lib/auth/session';
import { ApiError, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin } from '@/lib/auth/http';
import { createCustomRecommendation, listRecommendations, refreshRecommendations } from '@/lib/recommendations/service';
import { editableRecommendationContentSchema, supplementalFactsSchema } from '@/lib/recommendations/types';

export const maxDuration = 120;

const scopeSchema = z.string().trim().min(1).max(191);
const refreshSchema = z.object({
  action: z.literal('refresh'),
  scenarioId: scopeSchema.nullable().optional(),
  clientRevision: z.number().int().min(1),
  supplementalFacts: supplementalFactsSchema.optional(),
  csrfToken: z.string(),
}).strict();
const customSchema = z.object({
  action: z.literal('custom'),
  scenarioId: scopeSchema.nullable().optional(),
  clientRevision: z.number().int().min(1),
  content: editableRecommendationContentSchema,
  csrfToken: z.string(),
}).strict();
const mutationSchema = z.discriminatedUnion('action', [refreshSchema, customSchema]);

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdvisor(request);
    const { id } = await context.params;
    const rawScenario = request.nextUrl.searchParams.get('scenarioId');
    const parsedScenario = rawScenario === null ? undefined : scopeSchema.safeParse(rawScenario);
    if (parsedScenario && !parsedScenario.success) throw new ApiError(422, 'Scenario identifier is invalid.');
    const list = await listRecommendations(id, session.advisor.id, parsedScenario === undefined ? undefined : parsedScenario.data);
    return noStore(NextResponse.json({ ...list, csrfToken: session.csrfToken }));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    const body = await jsonBody(request);
    const parsed = mutationSchema.safeParse(body);
    if (!parsed.success) throw new ApiError(422, 'Check the recommendation action and fields.');
    requireCsrf(session.csrfToken, parsed.data.csrfToken);
    const { id } = await context.params;
    if (parsed.data.action === 'refresh') {
      const list = await refreshRecommendations(id, session.advisor.id, parsed.data.scenarioId, parsed.data.supplementalFacts ?? {}, parsed.data.clientRevision);
      return noStore(NextResponse.json({ ...list, csrfToken: session.csrfToken }));
    }
    const recommendation = await createCustomRecommendation({ clientId: id, advisorId: session.advisor.id, scenarioId: parsed.data.scenarioId, expectedClientRevision: parsed.data.clientRevision, content: parsed.data.content });
    return noStore(NextResponse.json({ recommendation, csrfToken: session.csrfToken }, { status: 201 }));
  } catch (error) { return errorResponse(error); }
}
