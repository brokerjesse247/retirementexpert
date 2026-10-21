import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ApiError } from '../lib/auth/http';

const requireAdvisor = vi.hoisted(() => vi.fn());
const listNotes = vi.hoisted(() => vi.fn());
const createNote = vi.hoisted(() => vi.fn());
const listTasks = vi.hoisted(() => vi.fn());
const createTask = vi.hoisted(() => vi.fn());
const updateTask = vi.hoisted(() => vi.fn());
const setTaskCompletion = vi.hoisted(() => vi.fn());

vi.mock('../lib/auth/session', () => ({ requireAdvisor }));
vi.mock('../lib/advisor-records/service', () => ({ listNotes, createNote, listTasks, createTask, updateTask, setTaskCompletion }));

import { GET as notesGet, POST as notesPost } from '../app/api/clients/[id]/notes/route';
import { GET as tasksGet, POST as tasksPost } from '../app/api/clients/[id]/tasks/route';
import { PATCH as taskPatch } from '../app/api/clients/[id]/tasks/[taskId]/route';

const advisor = { advisor: { id: 'advisor-own', name: 'Advisor', email: 'advisor@example.test', phone: null, licenseNumbers: null }, csrfToken: 'csrf-token' };
const clientContext = { params: Promise.resolve({ id: 'client-own' }) };
const taskContext = { params: Promise.resolve({ id: 'client-own', taskId: 'task-own' }) };

function request(path: string, method: string, body: unknown, origin = 'https://app.example.test') {
  return new NextRequest(`https://app.example.test${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
  });
}

describe('advisor records API route security', () => {
  beforeEach(() => {
    vi.stubEnv('APP_ORIGIN', 'https://app.example.test');
    vi.clearAllMocks();
    requireAdvisor.mockResolvedValue(advisor);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('rejects note writes from an untrusted origin before invoking the record service', async () => {
    const response = await notesPost(request('/api/clients/client-own/notes', 'POST', { body: 'Private note', csrfToken: 'csrf-token' }, ''), clientContext);
    expect(response.status).toBe(403);
    expect(createNote).not.toHaveBeenCalled();
  });

  it('requires the session CSRF token and rejects extra note fields', async () => {
    const badToken = await notesPost(request('/api/clients/client-own/notes', 'POST', { body: 'Private note', csrfToken: 'wrong-token' }), clientContext);
    expect(badToken.status).toBe(403);
    expect(createNote).not.toHaveBeenCalled();

    const extraField = await notesPost(request('/api/clients/client-own/notes', 'POST', { body: 'Private note', csrfToken: 'csrf-token', advisorId: 'attacker' }), clientContext);
    expect(extraField.status).toBe(422);
    expect(createNote).not.toHaveBeenCalled();
  });

  it('returns 404 rather than exposing a note/task collection for another advisor client', async () => {
    listNotes.mockRejectedValueOnce(new ApiError(404, 'Client not found.'));
    listTasks.mockRejectedValueOnce(new ApiError(404, 'Client not found.'));
    const notes = await notesGet(new NextRequest('https://app.example.test/api/clients/other-client/notes'), { params: Promise.resolve({ id: 'other-client' }) });
    const tasks = await tasksGet(new NextRequest('https://app.example.test/api/clients/other-client/tasks'), { params: Promise.resolve({ id: 'other-client' }) });
    expect(notes.status).toBe(404);
    expect(tasks.status).toBe(404);
    expect(listNotes).toHaveBeenCalledWith('other-client', 'advisor-own', false);
    expect(listTasks).toHaveBeenCalledWith('other-client', 'advisor-own');
  });

  it('enforces strict task writes and only accepts explicit task state transitions', async () => {
    const invalidCreate = await tasksPost(request('/api/clients/client-own/tasks', 'POST', { title: 'Call client', details: '', owner: '', dueAt: null, csrfToken: 'csrf-token', completedAt: 'fake' }), clientContext);
    expect(invalidCreate.status).toBe(422);
    expect(createTask).not.toHaveBeenCalled();

    const invalidTransition = await taskPatch(request('/api/clients/client-own/tasks/task-own', 'PATCH', { action: 'complete', revision: 1, csrfToken: 'csrf-token', extra: true }), taskContext);
    expect(invalidTransition.status).toBe(422);
    expect(setTaskCompletion).not.toHaveBeenCalled();

    setTaskCompletion.mockResolvedValueOnce({ id: 'task-own', title: 'Call client', details: '', owner: '', dueAt: null, completedAt: '2026-10-21T12:00:00.000Z', createdAt: '2026-10-20T12:00:00.000Z', updatedAt: '2026-10-21T12:00:00.000Z', revision: 2 });
    const accepted = await taskPatch(request('/api/clients/client-own/tasks/task-own', 'PATCH', { action: 'complete', revision: 1, csrfToken: 'csrf-token' }), taskContext);
    expect(accepted.status).toBe(200);
    expect(setTaskCompletion).toHaveBeenCalledWith('client-own', 'advisor-own', 'task-own', 'complete', 1);
  });
});
