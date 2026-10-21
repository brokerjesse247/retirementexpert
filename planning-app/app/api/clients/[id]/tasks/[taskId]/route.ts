import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdvisor } from '@/lib/auth/session';
import { ApiError, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin } from '@/lib/auth/http';
import { setTaskCompletion, updateTask } from '@/lib/advisor-records/service';
import { taskStateRequestSchema, updateTaskRequestSchema } from '@/lib/advisor-records/schema';

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(422, message);
  return parsed.data;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; taskId: string }> }) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    const raw = await jsonBody(request);
    const { id, taskId } = await context.params;

    if (typeof raw.action === 'string') {
      const body = parse(taskStateRequestSchema, raw, 'Use a supported task state transition and reload stale tasks.');
      requireCsrf(session.csrfToken, body.csrfToken);
      const task = await setTaskCompletion(id, session.advisor.id, taskId, body.action, body.revision);
      return noStore(NextResponse.json({ task, csrfToken: session.csrfToken }));
    }

    const body = parse(updateTaskRequestSchema, raw, 'Enter a task title and supported task details.');
    requireCsrf(session.csrfToken, body.csrfToken);
    const task = await updateTask(id, session.advisor.id, taskId, { title: body.title, details: body.details, owner: body.owner, dueAt: body.dueAt }, body.revision);
    return noStore(NextResponse.json({ task, csrfToken: session.csrfToken }));
  } catch (error) {
    return errorResponse(error);
  }
}
