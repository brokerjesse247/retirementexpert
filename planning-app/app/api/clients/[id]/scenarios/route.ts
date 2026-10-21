import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdvisor } from '@/lib/auth/session';
import { errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin, ApiError } from '@/lib/auth/http';
import { scenarioOverridesSchema } from '@/lib/calculations/input';
import { createScenario, listScenarios } from '@/lib/scenarios/service';

export const maxDuration = 120;
const createSchema = z.object({ name: z.string().min(1).max(180), overrides: scenarioOverridesSchema, csrfToken: z.string() }).strict();

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdvisor(request);
    const { id } = await ctx.params;
    return noStore(NextResponse.json({ scenarios: await listScenarios(id, session.advisor.id), csrfToken: session.csrfToken }));
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    const { id } = await ctx.params;
    const parsed = createSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApiError(422, 'Provide a scenario name and only supported scenario inputs.');
    requireCsrf(session.csrfToken, parsed.data.csrfToken);
    const scenario = await createScenario(id, session.advisor.id, parsed.data.name, parsed.data.overrides);
    return noStore(NextResponse.json({ scenario, csrfToken: session.csrfToken }, { status: 201 }));
  } catch (error) { return errorResponse(error); }
}
