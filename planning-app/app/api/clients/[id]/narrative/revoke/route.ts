import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdvisor } from '@/lib/auth/session';
import { ApiError, clientRateLimitKey, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin } from '@/lib/auth/http';
import { enforceRateLimit } from '@/lib/auth/rate-limit';
import { revokeNarrativeApproval } from '@/lib/narrative/service';

const bodySchema = z.object({ scenarioId: z.string().trim().min(1).max(191).nullable().optional(), revision: z.number().int().min(0).max(2_147_483_647), csrfToken: z.string() }).strict();
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    await enforceRateLimit('narrative-revoke', `${session.advisor.id}:${clientRateLimitKey(request)}`, 20, 60 * 60_000);
    const body = bodySchema.safeParse(await jsonBody(request));
    if (!body.success) throw new ApiError(422, 'Check the narrative revoke request.');
    requireCsrf(session.csrfToken, body.data.csrfToken);
    const { id } = await ctx.params;
    return noStore(NextResponse.json({ ...await revokeNarrativeApproval(id, session.advisor.id, body.data), csrfToken: session.csrfToken }));
  } catch (error) { return errorResponse(error); }
}
