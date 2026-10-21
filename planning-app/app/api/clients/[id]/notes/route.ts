import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdvisor } from '@/lib/auth/session';
import { ApiError, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin } from '@/lib/auth/http';
import { createNote, listNotes } from '@/lib/advisor-records/service';
import { createNoteRequestSchema } from '@/lib/advisor-records/schema';

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(422, message);
  return parsed.data;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdvisor(request);
    const { id } = await context.params;
    const includeArchived = request.nextUrl.searchParams.get('archived') === 'all';
    const notes = await listNotes(id, session.advisor.id, includeArchived);
    return noStore(NextResponse.json({ notes, csrfToken: session.csrfToken }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    const body = parse(createNoteRequestSchema, await jsonBody(request), 'Enter a note using the supported fields.');
    requireCsrf(session.csrfToken, body.csrfToken);
    const { id } = await context.params;
    const note = await createNote(id, session.advisor.id, { body: body.body });
    return noStore(NextResponse.json({ note, csrfToken: session.csrfToken }, { status: 201 }));
  } catch (error) {
    return errorResponse(error);
  }
}
