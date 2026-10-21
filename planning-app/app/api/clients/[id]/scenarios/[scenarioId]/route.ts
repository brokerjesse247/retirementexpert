import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdvisor } from '@/lib/auth/session';
import { errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin, ApiError } from '@/lib/auth/http';
import { scenarioOverridesSchema } from '@/lib/calculations/input';
import { listScenarios, loadScenarioAnalysis, updateScenario } from '@/lib/scenarios/service';

export const maxDuration = 120;
const patchSchema = z.object({
  name: z.string().min(1).max(180).optional(),
  overrides: scenarioOverridesSchema.optional(),
  revision: z.number().int().min(1),
  csrfToken: z.string(),
}).strict().refine((value) => value.name !== undefined || value.overrides !== undefined, 'Provide scenario changes.');

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string; scenarioId: string }> }) {
  try {
    const session = await requireAdvisor(request);
    const { id, scenarioId } = await ctx.params;
    const analysis = await loadScenarioAnalysis(id, session.advisor.id, scenarioId);
    const scenario = (await listScenarios(id, session.advisor.id)).find((item) => item.id === scenarioId);
    if (!scenario) throw new ApiError(404, 'Scenario not found.');
    return noStore(NextResponse.json({ scenario, ...analysis, csrfToken: session.csrfToken }));
  } catch (error) { return errorResponse(error); }
}
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string; scenarioId: string }> }) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    const { id, scenarioId } = await ctx.params;
    const parsed = patchSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApiError(422, 'Provide a current revision and only supported scenario changes.');
    requireCsrf(session.csrfToken, parsed.data.csrfToken);
    const scenario = await updateScenario(id, session.advisor.id, scenarioId, parsed.data.revision, { name: parsed.data.name, overrides: parsed.data.overrides });
    return noStore(NextResponse.json({ scenario, csrfToken: session.csrfToken }));
  } catch (error) { return errorResponse(error); }
}
