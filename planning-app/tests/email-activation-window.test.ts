import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ emailOutbox: { updateMany: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() } }));
vi.mock('../lib/db', () => ({ db }));
vi.mock('../lib/auth/crypto', () => ({ decryptJson: vi.fn(), encryptJson: vi.fn(), tokenHash: vi.fn(() => 'hashed-owner') }));
import { deliverDueOutbox, deliverOutboxMessage } from '../lib/services/email';

const activatedAt = '2026-10-21T20:42:01.000Z';
describe('production outbox activation window', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('OUTBOX_ACTIVATED_AT', '');
    db.emailOutbox.updateMany.mockResolvedValue({ count: 0 });
    db.emailOutbox.findMany.mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('never claims or sends a message without a verified activation time', async () => {
    await expect(deliverDueOutbox()).rejects.toThrow('MAIL_ACTIVATION_CONFIGURATION');
    await expect(deliverOutboxMessage('old-message')).rejects.toThrow('MAIL_ACTIVATION_CONFIGURATION');
    expect(db.emailOutbox.updateMany).not.toHaveBeenCalled();
    expect(db.emailOutbox.findMany).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects malformed or non-canonical activation dates before a database write', async () => {
    vi.stubEnv('OUTBOX_ACTIVATED_AT', 'not-a-date');
    await expect(deliverDueOutbox()).rejects.toThrow('MAIL_ACTIVATION_CONFIGURATION');
    vi.stubEnv('OUTBOX_ACTIVATED_AT', '2026-10-21');
    await expect(deliverOutboxMessage('message')).rejects.toThrow('MAIL_ACTIVATION_CONFIGURATION');
    expect(db.emailOutbox.updateMany).not.toHaveBeenCalled();
  });
  it('selects only new post-activation messages in the scheduled pass', async () => {
    vi.stubEnv('OUTBOX_ACTIVATED_AT', activatedAt);
    await expect(deliverDueOutbox()).resolves.toEqual({ sent: 0, failed: 0, retry: 0 });
    expect(db.emailOutbox.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ createdAt: { gte: new Date(activatedAt) } }) }));
    expect(fetch).not.toHaveBeenCalled();
  });
  it('also clamps a direct message claim so an old ID cannot bypass the scheduled filter', async () => {
    vi.stubEnv('OUTBOX_ACTIVATED_AT', activatedAt);
    await expect(deliverOutboxMessage('old-message')).resolves.toBe('skipped');
    expect(db.emailOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'old-message', createdAt: { gte: new Date(activatedAt) } }) }));
    expect(fetch).not.toHaveBeenCalled();
  });
});
