import { NextRequest, NextResponse } from 'next/server';
import { requireAdvisor } from '@/lib/auth/session';
import { errorResponse, noStore, ApiError } from '@/lib/auth/http';
import { scenarioComparison } from '@/lib/scenarios/service';

export const maxDuration = 120;
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdvisor(request);
    const { id } = await ctx.params;
    const repeated = request.nextUrl.searchParams.getAll('id');
    const commaSeparated = request.nextUrl.searchParams.get('ids');
    const ids = repeated.length ? repeated : (commaSeparated?.split(',').filter(Boolean) ?? []);
    if (ids.length > 3) throw new ApiError(422, 'Choose no more than three scenarios to compare.');
    return noStore(NextResponse.json({ ...await scenarioComparison(id, session.advisor.id, ids), csrfToken: session.csrfToken }));
  } catch (error) { return errorResponse(error); }
}
