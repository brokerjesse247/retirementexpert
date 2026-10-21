import { NextRequest, NextResponse } from 'next/server';
import { requireAdvisor } from '@/lib/auth/session';
import { ApiError, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin } from '@/lib/auth/http';
import { changeRetentionHold, retentionChangeSchema, retentionOverview } from '@/lib/retention/service';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const session = await requireAdvisor(request);
    const { id } = await context.params;
    const retention = await retentionOverview(id, session.advisor.id);
    return noStore(NextResponse.json({ retention, csrfToken: session.csrfToken }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    const parsed = retentionChangeSchema.safeParse(await jsonBody(request));
    if (!parsed.success) throw new ApiError(422, 'Choose an explicit hold action and provide a reason of 500 characters or fewer.');
    requireCsrf(session.csrfToken, parsed.data.csrfToken);
    const { id } = await context.params;
    const retention = await changeRetentionHold(id, session.advisor.id, parsed.data);
    return noStore(NextResponse.json({ retention, csrfToken: session.csrfToken }));
  } catch (error) {
    return errorResponse(error);
  }
}
