import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdvisor } from '@/lib/auth/session';
import { ApiError, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin } from '@/lib/auth/http';
import { updateRecommendation } from '@/lib/recommendations/service';
import { editableRecommendationContentSchema } from '@/lib/recommendations/types';

const schema = z.object({
  action: z.enum(['approve', 'edit', 'remove']),
  revision: z.number().int().min(1),
  content: editableRecommendationContentSchema.optional(),
  csrfToken: z.string(),
}).strict().superRefine((value, ctx) => {
  if (value.action === 'edit' && !value.content) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['content'], message: 'Edited content is required.' });
  if (value.action !== 'edit' && value.content !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['content'], message: 'Content is only accepted for edits.' });
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; recommendationId: string }> }) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    const body = await jsonBody(request);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError(422, 'Check the recommendation action and fields.');
    requireCsrf(session.csrfToken, parsed.data.csrfToken);
    const { id, recommendationId } = await context.params;
    const recommendation = await updateRecommendation({ clientId: id, advisorId: session.advisor.id, recommendationId, revision: parsed.data.revision, action: parsed.data.action, content: parsed.data.content });
    return noStore(NextResponse.json({ recommendation, csrfToken: session.csrfToken }));
  } catch (error) { return errorResponse(error); }
}
