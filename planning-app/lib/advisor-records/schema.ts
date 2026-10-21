import { z } from 'zod';

const csrfTokenSchema = z.string().min(1).max(256);
const revisionSchema = z.number().int().min(1);

function textField(min: number, max: number, label: string) {
  return z.string().trim().min(min, `${label} is required.`).max(max, `${label} is too long.`)
    .refine((value) => !value.includes('\u0000'), `${label} contains an invalid character.`);
}

function optionalTextField(max: number, label: string) {
  return z.string().trim().max(max, `${label} is too long.`)
    .refine((value) => !value.includes('\u0000'), `${label} contains an invalid character.`);
}

/** A calendar date is stored at UTC midnight; no time zone supplied by a browser is accepted. */
export const dueAtSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must use YYYY-MM-DD.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, 'Due date is not valid.');

export const noteContentSchema = z.object({
  body: textField(1, 10_000, 'Note'),
}).strict();

export const createNoteRequestSchema = noteContentSchema.extend({
  csrfToken: csrfTokenSchema,
}).strict();

export const updateNoteRequestSchema = noteContentSchema.extend({
  revision: revisionSchema,
  csrfToken: csrfTokenSchema,
}).strict();

export const archiveNoteRequestSchema = z.object({
  revision: revisionSchema,
  csrfToken: csrfTokenSchema,
}).strict();

export const taskContentSchema = z.object({
  title: textField(1, 240, 'Task title'),
  details: optionalTextField(5_000, 'Task details'),
  owner: optionalTextField(160, 'Task owner'),
  dueAt: dueAtSchema.nullable(),
}).strict();

export const createTaskRequestSchema = taskContentSchema.extend({
  csrfToken: csrfTokenSchema,
}).strict();

export const updateTaskRequestSchema = taskContentSchema.extend({
  revision: revisionSchema,
  csrfToken: csrfTokenSchema,
}).strict();

export const taskStateRequestSchema = z.object({
  action: z.enum(['complete', 'reopen']),
  revision: revisionSchema,
  csrfToken: csrfTokenSchema,
}).strict();

export type NoteContent = z.infer<typeof noteContentSchema>;
export type TaskContent = z.infer<typeof taskContentSchema>;
export type CreateNoteRequest = z.infer<typeof createNoteRequestSchema>;
export type UpdateNoteRequest = z.infer<typeof updateNoteRequestSchema>;
export type ArchiveNoteRequest = z.infer<typeof archiveNoteRequestSchema>;
export type CreateTaskRequest = z.infer<typeof createTaskRequestSchema>;
export type UpdateTaskRequest = z.infer<typeof updateTaskRequestSchema>;
export type TaskStateRequest = z.infer<typeof taskStateRequestSchema>;
