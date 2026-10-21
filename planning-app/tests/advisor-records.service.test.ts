import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/auth/http';
import { encryptJson } from '../lib/auth/crypto';

const ownedClient = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  followUpTask: { findMany: vi.fn(), findFirst: vi.fn() },
}));

vi.mock('../lib/db', () => ({ db }));
vi.mock('../lib/calculations/service', () => ({ ownedClient }));

import { listTasks, setTaskCompletion } from '../lib/advisor-records/service';

const createdAt = new Date('2026-10-20T09:00:00.000Z');
const updatedAt = new Date('2026-10-20T09:00:00.000Z');

function taskRow(completedAt: Date | null, revision: number) {
  return {
    id: 'task-one',
    clientId: 'client-one',
    encryptedContent: encryptJson({ title: 'Call client', details: 'Review annual update.', owner: 'Advisor' }),
    dueAt: new Date('2026-10-22T00:00:00.000Z'),
    completedAt,
    createdAt,
    updatedAt,
    revision,
  };
}

describe('advisor-record task state transitions', () => {
  const originalKey = process.env.DATA_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 23).toString('base64');
    vi.clearAllMocks();
    ownedClient.mockResolvedValue({ id: 'client-one', advisorId: 'advisor-one' });
  });
  afterEach(() => {
    process.env.DATA_ENCRYPTION_KEY = originalKey;
    vi.unstubAllEnvs();
  });

  it('completes then reopens a task through state-specific, optimistic-revision writes without changing createdAt', async () => {
    const completedAt = new Date('2026-10-21T10:00:00.000Z');
    const completionUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const completionFind = vi.fn().mockResolvedValue(taskRow(completedAt, 2));
    const completionAudit = vi.fn().mockResolvedValue({});
    db.$transaction.mockImplementationOnce(async (callback: (tx: unknown) => unknown) => callback({
      followUpTask: { updateMany: completionUpdate, findUnique: completionFind }, auditLog: { create: completionAudit },
    }));

    const completed = await setTaskCompletion('client-one', 'advisor-one', 'task-one', 'complete', 1);
    expect(completionUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'task-one', clientId: 'client-one', revision: 1, completedAt: null },
      data: expect.objectContaining({ revision: { increment: 1 } }),
    }));
    expect(completionUpdate.mock.calls[0][0].data.completedAt).toBeInstanceOf(Date);
    expect(completed).toMatchObject({ id: 'task-one', completedAt: completedAt.toISOString(), revision: 2, createdAt: createdAt.toISOString() });
    expect(completionAudit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'FOLLOW_UP_TASK_COMPLETED', summary: 'Advisor completed a follow-up task.' }) }));

    const reopenUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const reopenFind = vi.fn().mockResolvedValue(taskRow(null, 3));
    const reopenAudit = vi.fn().mockResolvedValue({});
    db.$transaction.mockImplementationOnce(async (callback: (tx: unknown) => unknown) => callback({
      followUpTask: { updateMany: reopenUpdate, findUnique: reopenFind }, auditLog: { create: reopenAudit },
    }));

    const reopened = await setTaskCompletion('client-one', 'advisor-one', 'task-one', 'reopen', 2);
    expect(reopenUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'task-one', clientId: 'client-one', revision: 2, completedAt: { not: null } },
      data: { completedAt: null, revision: { increment: 1 } },
    }));
    expect(reopened).toMatchObject({ id: 'task-one', completedAt: null, revision: 3, createdAt: createdAt.toISOString() });
    expect(reopenAudit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'FOLLOW_UP_TASK_REOPENED', summary: 'Advisor reopened a follow-up task.' }) }));
  });

  it('does not query task records after the owned-client check rejects another advisor', async () => {
    ownedClient.mockRejectedValueOnce(new ApiError(404, 'Client not found.'));
    await expect(listTasks('other-client', 'advisor-one')).rejects.toMatchObject({ status: 404 });
    expect(db.followUpTask.findMany).not.toHaveBeenCalled();
  });
});
