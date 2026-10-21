import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ operationsReplayNonce: { count: vi.fn() }, $queryRaw: vi.fn() }));
vi.mock('@/lib/db', () => ({ db }));
import { verifyDatabaseReplayStorage } from '@/lib/operations/replay-health';

describe('production replay schema probe', () => {
  beforeEach(() => { vi.resetAllMocks(); db.operationsReplayNonce.count.mockResolvedValue(0); });
  it('verifies a single-column fingerprint primary key without writes', async () => {
    db.$queryRaw.mockResolvedValue([{ COLUMN_NAME: 'fingerprint', NON_UNIQUE: 0n }]);
    expect(await verifyDatabaseReplayStorage()).toBe(true);
  });
  it('fails closed when the table or unique constraint is missing or composite', async () => {
    for (const result of [[], [{ COLUMN_NAME: 'fingerprint', NON_UNIQUE: 1 }], [{ COLUMN_NAME: 'id', NON_UNIQUE: 0 }], [{ COLUMN_NAME: 'fingerprint', NON_UNIQUE: 0 }, { COLUMN_NAME: 'expiresAt', NON_UNIQUE: 0 }]]) {
      db.$queryRaw.mockResolvedValue(result);
      expect(await verifyDatabaseReplayStorage()).toBe(false);
    }
    db.operationsReplayNonce.count.mockRejectedValue(new Error('unavailable'));
    expect(await verifyDatabaseReplayStorage()).toBe(false);
  });
});
