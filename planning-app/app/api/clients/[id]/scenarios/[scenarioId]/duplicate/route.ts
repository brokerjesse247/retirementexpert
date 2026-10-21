import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdvisor } from '@/lib/auth/session';
import { errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin, ApiError } from '@/lib/auth/http';
import { duplicateScenario } from '@/lib/scenarios/service';

const schema = z.object({ name: z.string().min(1).max(180).optional(), csrfToken: z.string() }).strict();
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string; scenarioId: string }> }) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    const { id, scenarioId } = await ctx.params;
    const parsed = schema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApiError(422, 'Provide a valid optional duplicate name.');
    requireCsrf(session.csrfToken, parsed.data.csrfToken);
    const scenario = await duplicateScenario(id, session.advisor.id, scenarioId, parsed.data.name);
    return noStore(NextResponse.json({ scenario, csrfToken: session.csrfToken }, { status: 201 }));
  } catch (error) { return errorResponse(error); }
}
