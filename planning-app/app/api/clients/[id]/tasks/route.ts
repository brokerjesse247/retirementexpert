import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdvisor } from '@/lib/auth/session';
import { ApiError, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin } from '@/lib/auth/http';
import { createTask, listTasks } from '@/lib/advisor-records/service';
import { createTaskRequestSchema } from '@/lib/advisor-records/schema';

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(422, message);
  return parsed.data;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdvisor(request);
    const { id } = await context.params;
    const tasks = await listTasks(id, session.advisor.id);
    return noStore(NextResponse.json({ tasks, csrfToken: session.csrfToken }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    const body = parse(createTaskRequestSchema, await jsonBody(request), 'Enter a task title and supported task details.');
    requireCsrf(session.csrfToken, body.csrfToken);
    const { id } = await context.params;
    const task = await createTask(id, session.advisor.id, { title: body.title, details: body.details, owner: body.owner, dueAt: body.dueAt });
    return noStore(NextResponse.json({ task, csrfToken: session.csrfToken }, { status: 201 }));
  } catch (error) {
    return errorResponse(error);
  }
}
