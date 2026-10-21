import { decryptJson, encryptJson } from '@/lib/auth/crypto';
import { ApiError } from '@/lib/auth/http';
import { db } from '@/lib/db';
import { ownedClient } from '@/lib/calculations/service';
import { noteContentSchema, taskContentSchema, type NoteContent, type TaskContent, type TaskStateRequest } from './schema';

export type AdvisorNote = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  archivedAt: string | null;
};

export type AdvisorTask = {
  id: string;
  title: string;
  details: string;
  owner: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
};

type StoredNote = NoteContent & { archivedAt?: string };
type StoredTaskContent = Pick<TaskContent, 'title' | 'details' | 'owner'>;

function parseStoredNote(encryptedBody: string): StoredNote {
  const raw = decryptJson<unknown>(encryptedBody);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiError(503, 'Advisor records are unavailable.');
  const parsed = noteContentSchema.safeParse({ body: (raw as Record<string, unknown>).body });
  if (!parsed.success) throw new ApiError(503, 'Advisor records are unavailable.');
  const archivedAt = (raw as Record<string, unknown>).archivedAt;
  if (archivedAt !== undefined && (typeof archivedAt !== 'string' || !Number.isFinite(new Date(archivedAt).valueOf()))) {
    throw new ApiError(503, 'Advisor records are unavailable.');
  }
  return archivedAt ? { ...parsed.data, archivedAt } : parsed.data;
}

function parseStoredTask(encryptedContent: string): StoredTaskContent {
  const raw = decryptJson<unknown>(encryptedContent);
  const parsed = taskContentSchema.omit({ dueAt: true }).safeParse(raw);
  if (!parsed.success) throw new ApiError(503, 'Advisor records are unavailable.');
  return parsed.data;
}

function date(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function noteView(row: { id: string; encryptedBody: string; createdAt: Date; updatedAt: Date; revision: number }): AdvisorNote {
  const content = parseStoredNote(row.encryptedBody);
  return {
    id: row.id,
    body: content.body,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    revision: row.revision,
    archivedAt: content.archivedAt ?? null,
  };
}

function taskView(row: { id: string; encryptedContent: string; dueAt: Date | null; completedAt: Date | null; createdAt: Date; updatedAt: Date; revision: number }): AdvisorTask {
  const content = parseStoredTask(row.encryptedContent);
  return {
    id: row.id,
    title: content.title,
    details: content.details,
    owner: content.owner,
    dueAt: date(row.dueAt),
    completedAt: date(row.completedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    revision: row.revision,
  };
}

function dueAt(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

async function ownedNote(clientId: string, noteId: string) {
  const row = await db.note.findFirst({ where: { id: noteId, clientId } });
  if (!row) throw new ApiError(404, 'Note not found.');
  return row;
}

async function ownedTask(clientId: string, taskId: string) {
  const row = await db.followUpTask.findFirst({ where: { id: taskId, clientId } });
  if (!row) throw new ApiError(404, 'Task not found.');
  return row;
}

/** Lists records only after the parent client has been proven owned by this advisor. */
export async function listNotes(clientId: string, advisorId: string, includeArchived = false): Promise<AdvisorNote[]> {
  await ownedClient(clientId, advisorId);
  const rows = await db.note.findMany({ where: { clientId }, orderBy: { updatedAt: 'desc' } });
  const notes = rows.map(noteView);
  return includeArchived ? notes : notes.filter((note) => !note.archivedAt);
}

export async function createNote(clientId: string, advisorId: string, content: NoteContent): Promise<AdvisorNote> {
  await ownedClient(clientId, advisorId);
  const row = await db.$transaction(async (tx) => {
    const note = await tx.note.create({ data: { clientId, encryptedBody: encryptJson(content) } });
    await tx.auditLog.create({
      data: { advisorId, clientId, action: 'NOTE_CREATED', entity: 'Note', entityId: note.id, summary: 'Advisor created a private note.' },
    });
    return note;
  });
  return noteView(row);
}

export async function updateNote(clientId: string, advisorId: string, noteId: string, content: NoteContent, revision: number): Promise<AdvisorNote> {
  await ownedClient(clientId, advisorId);
  const existing = await ownedNote(clientId, noteId);
  if (parseStoredNote(existing.encryptedBody).archivedAt) throw new ApiError(409, 'Archived notes cannot be edited.');
  const updated = await db.$transaction(async (tx) => {
    const claim = await tx.note.updateMany({
      where: { id: noteId, clientId, revision },
      data: { encryptedBody: encryptJson(content), revision: { increment: 1 } },
    });
    if (!claim.count) return null;
    const note = await tx.note.findUnique({ where: { id: noteId } });
    if (!note) return null;
    await tx.auditLog.create({
      data: { advisorId, clientId, action: 'NOTE_EDITED', entity: 'Note', entityId: noteId, summary: 'Advisor edited a private note.' },
    });
    return note;
  });
  if (!updated) {
    await ownedNote(clientId, noteId);
    throw new ApiError(409, 'This note was updated elsewhere. Reload and try again.');
  }
  return noteView(updated);
}

/**
 * Notes are archived rather than physically deleted. Their audit trail remains,
 * and this unit never mutates Report or Report.encryptedSnapshot rows.
 */
export async function archiveNote(clientId: string, advisorId: string, noteId: string, revision: number): Promise<AdvisorNote> {
  await ownedClient(clientId, advisorId);
  const existing = await ownedNote(clientId, noteId);
  const stored = parseStoredNote(existing.encryptedBody);
  if (stored.archivedAt) throw new ApiError(409, 'This note is already archived.');
  const archivedAt = new Date().toISOString();
  const updated = await db.$transaction(async (tx) => {
    const claim = await tx.note.updateMany({
      where: { id: noteId, clientId, revision },
      data: { encryptedBody: encryptJson({ ...stored, archivedAt }), revision: { increment: 1 } },
    });
    if (!claim.count) return null;
    const note = await tx.note.findUnique({ where: { id: noteId } });
    if (!note) return null;
    await tx.auditLog.create({
      data: { advisorId, clientId, action: 'NOTE_ARCHIVED', entity: 'Note', entityId: noteId, summary: 'Advisor archived a private note; immutable reports remain unchanged.' },
    });
    return note;
  });
  if (!updated) {
    await ownedNote(clientId, noteId);
    throw new ApiError(409, 'This note was updated elsewhere. Reload and try again.');
  }
  return noteView(updated);
}

export async function listTasks(clientId: string, advisorId: string): Promise<AdvisorTask[]> {
  await ownedClient(clientId, advisorId);
  const rows = await db.followUpTask.findMany({ where: { clientId }, orderBy: [{ completedAt: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }] });
  return rows.map(taskView);
}

export async function createTask(clientId: string, advisorId: string, content: TaskContent): Promise<AdvisorTask> {
  await ownedClient(clientId, advisorId);
  const row = await db.$transaction(async (tx) => {
    const task = await tx.followUpTask.create({
      data: { clientId, encryptedContent: encryptJson({ title: content.title, details: content.details, owner: content.owner }), dueAt: dueAt(content.dueAt) },
    });
    await tx.auditLog.create({
      data: { advisorId, clientId, action: 'FOLLOW_UP_TASK_CREATED', entity: 'FollowUpTask', entityId: task.id, summary: 'Advisor created a follow-up task.' },
    });
    return task;
  });
  return taskView(row);
}

export async function updateTask(clientId: string, advisorId: string, taskId: string, content: TaskContent, revision: number): Promise<AdvisorTask> {
  await ownedClient(clientId, advisorId);
  const updated = await db.$transaction(async (tx) => {
    const claim = await tx.followUpTask.updateMany({
      where: { id: taskId, clientId, revision },
      data: {
        encryptedContent: encryptJson({ title: content.title, details: content.details, owner: content.owner }),
        dueAt: dueAt(content.dueAt),
        revision: { increment: 1 },
      },
    });
    if (!claim.count) return null;
    const task = await tx.followUpTask.findUnique({ where: { id: taskId } });
    if (!task) return null;
    await tx.auditLog.create({
      data: { advisorId, clientId, action: 'FOLLOW_UP_TASK_EDITED', entity: 'FollowUpTask', entityId: taskId, summary: 'Advisor edited a follow-up task.' },
    });
    return task;
  });
  if (!updated) {
    await ownedTask(clientId, taskId);
    throw new ApiError(409, 'This task was updated elsewhere. Reload and try again.');
  }
  return taskView(updated);
}

/** Complete and reopen are explicit, revision-protected state transitions. */
export async function setTaskCompletion(clientId: string, advisorId: string, taskId: string, action: TaskStateRequest['action'], revision: number): Promise<AdvisorTask> {
  await ownedClient(clientId, advisorId);
  const completing = action === 'complete';
  const updated = await db.$transaction(async (tx) => {
    const claim = await tx.followUpTask.updateMany({
      where: { id: taskId, clientId, revision, completedAt: completing ? null : { not: null } },
      data: { completedAt: completing ? new Date() : null, revision: { increment: 1 } },
    });
    if (!claim.count) return null;
    const task = await tx.followUpTask.findUnique({ where: { id: taskId } });
    if (!task) return null;
    await tx.auditLog.create({
      data: {
        advisorId,
        clientId,
        action: completing ? 'FOLLOW_UP_TASK_COMPLETED' : 'FOLLOW_UP_TASK_REOPENED',
        entity: 'FollowUpTask',
        entityId: taskId,
        summary: completing ? 'Advisor completed a follow-up task.' : 'Advisor reopened a follow-up task.',
      },
    });
    return task;
  });
  if (!updated) {
    await ownedTask(clientId, taskId);
    throw new ApiError(409, completing ? 'This task was updated or is already complete. Reload and try again.' : 'This task was updated or is already open. Reload and try again.');
  }
  return taskView(updated);
}
