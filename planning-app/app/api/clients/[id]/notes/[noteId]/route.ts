import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdvisor } from '@/lib/auth/session';
import { ApiError, errorResponse, jsonBody, noStore, requireCsrf, requireTrustedOrigin } from '@/lib/auth/http';
import { archiveNote, updateNote } from '@/lib/advisor-records/service';
import { archiveNoteRequestSchema, updateNoteRequestSchema } from '@/lib/advisor-records/schema';

function parse<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(422, message);
  return parsed.data;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; noteId: string }> }) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    const body = parse(updateNoteRequestSchema, await jsonBody(request), 'Enter a note and reload before saving a stale version.');
    requireCsrf(session.csrfToken, body.csrfToken);
    const { id, noteId } = await context.params;
    const note = await updateNote(id, session.advisor.id, noteId, { body: body.body }, body.revision);
    return noStore(NextResponse.json({ note, csrfToken: session.csrfToken }));
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE archives instead of destroying note/audit history or touching immutable report snapshots. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; noteId: string }> }) {
  try {
    requireTrustedOrigin(request);
    const session = await requireAdvisor(request);
    const body = parse(archiveNoteRequestSchema, await jsonBody(request), 'Reload this note before archiving it.');
    requireCsrf(session.csrfToken, body.csrfToken);
    const { id, noteId } = await context.params;
    const note = await archiveNote(id, session.advisor.id, noteId, body.revision);
    return noStore(NextResponse.json({ note, csrfToken: session.csrfToken }));
  } catch (error) {
    return errorResponse(error);
  }
}
