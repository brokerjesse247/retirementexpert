import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdvisor } from '@/lib/auth/session';
import { errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin, ApiError } from '@/lib/auth/http';
import { resetScenario } from '@/lib/scenarios/service';

const schema = z.object({ revision: z.number().int().min(1), csrfToken: z.string() }).strict();
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string; scenarioId: string }> }) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    const { id, scenarioId } = await ctx.params;
    const parsed = schema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApiError(422, 'Provide the current scenario revision.');
    requireCsrf(session.csrfToken, parsed.data.csrfToken);
    const scenario = await resetScenario(id, session.advisor.id, scenarioId, parsed.data.revision);
    return noStore(NextResponse.json({ scenario, csrfToken: session.csrfToken }));
  } catch (error) { return errorResponse(error); }
}
