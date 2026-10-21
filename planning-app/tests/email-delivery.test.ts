import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  emailOutbox: {
    create: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
}));
const decryptJson = vi.hoisted(() => vi.fn());
const encryptJson = vi.hoisted(() => vi.fn());
const tokenHash = vi.hoisted(() => vi.fn());

vi.mock('../lib/db', () => ({ db }));
vi.mock('../lib/auth/crypto', () => ({ decryptJson, encryptJson, tokenHash }));

import { APPROVED_MAIL_DESTINATION, deliverDueOutbox, deliverOutboxMessage, queueEmail } from '../lib/services/email';

const oldRecipient = 'client@example.test';
const payload = { to: oldRecipient, displayName: 'LSRT Insurance', subject: 'Test', text: 'Text', html: '<p>Text</p>' };

function outboxRow(id = 'outbox-one', attempts = 0) {
  return { id, attempts, encryptedPayload: 'legacy-encrypted-payload' };
}

function sentResponse() {
  return new Response(null, { status: 204 });
}

describe('outbox mail delivery policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('HOSTINGER_MAIL_API_TOKEN', 'test-token');
    vi.stubEnv('HOSTINGER_MAIL_SENDER_VERIFIED', 'true');
    tokenHash.mockImplementation((recipient: string) => `hash:${recipient}`);
    encryptJson.mockImplementation((value: unknown) => JSON.stringify(value));
    decryptJson.mockReturnValue(payload);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('queues only the approved destination and records a matching recipient hash', async () => {
    db.emailOutbox.create.mockResolvedValue({ id: 'outbox-one' });

    await queueEmail(payload, 'PORTAL_NOTICE', 'advisor-one');

    const create = db.emailOutbox.create.mock.calls[0][0];
    expect(create.data.recipientHash).toBe(`hash:${APPROVED_MAIL_DESTINATION}`);
    expect(JSON.parse(create.data.encryptedPayload)).toMatchObject({ ...payload, to: APPROVED_MAIL_DESTINATION });
  });

  it('redirects a legacy queued recipient at claim and transport time', async () => {
    db.emailOutbox.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });
    db.emailOutbox.findUnique.mockResolvedValue(outboxRow());
    const fetchMock = vi.fn().mockResolvedValue(sentResponse());
    vi.stubGlobal('fetch', fetchMock);

    await expect(deliverOutboxMessage('outbox-one')).resolves.toBe('sent');

    expect(db.emailOutbox.updateMany.mock.calls[0][0].data).toEqual({ status: 'SENDING', recipientHash: `hash:${APPROVED_MAIL_DESTINATION}` });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).to).toEqual([APPROVED_MAIL_DESTINATION]);
  });

  it('marks a permanent 403 as terminal without scheduling another attempt', async () => {
    db.emailOutbox.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });
    db.emailOutbox.findUnique.mockResolvedValue(outboxRow());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })));

    await expect(deliverOutboxMessage('outbox-one')).resolves.toBe('failed');

    const terminal = db.emailOutbox.updateMany.mock.calls[1][0].data;
    expect(terminal).toMatchObject({ status: 'FAILED', attempts: 1, lastErrorCode: 'MAIL_HTTP_403' });
    expect(terminal).not.toHaveProperty('nextAttemptAt');
  });

  it('retries a 429 using its bounded Retry-After delay', async () => {
    db.emailOutbox.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });
    db.emailOutbox.findUnique.mockResolvedValue(outboxRow());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { 'Retry-After': '45' } })));
    const before = Date.now();

    await expect(deliverOutboxMessage('outbox-one')).resolves.toBe('retry');

    const retry = db.emailOutbox.updateMany.mock.calls[1][0].data;
    expect(retry).toMatchObject({ status: 'RETRY', attempts: 1, lastErrorCode: 'MAIL_HTTP_429' });
    expect(retry.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 45_000);
    expect(retry.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now() + 45_000);
  });

  it('fails unknown provider acceptance rather than automatically repeating it', async () => {
    db.emailOutbox.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });
    db.emailOutbox.findUnique.mockResolvedValue(outboxRow());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 202 })));

    await expect(deliverOutboxMessage('outbox-one')).resolves.toBe('failed');

    const terminal = db.emailOutbox.updateMany.mock.calls[1][0].data;
    expect(terminal).toMatchObject({ status: 'FAILED', attempts: 1, lastErrorCode: 'MAIL_HTTP_202' });
    expect(terminal).not.toHaveProperty('nextAttemptAt');
  });

  it('uses a default batch of two, caps oversized batches at ten, and does not overlap sends', async () => {
    db.emailOutbox.updateMany.mockResolvedValue({ count: 0 });
    db.emailOutbox.findMany.mockResolvedValue([]);
    await deliverDueOutbox();
    expect(db.emailOutbox.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 2 }));

    await deliverDueOutbox(100);
    expect(db.emailOutbox.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 10 }));

    const rows = [outboxRow('outbox-one'), outboxRow('outbox-two')];
    db.emailOutbox.updateMany.mockResolvedValue({ count: 1 });
    db.emailOutbox.findMany.mockResolvedValue(rows.map(({ id }) => ({ id })));
    db.emailOutbox.findUnique.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(rows.find((row) => row.id === where.id) ?? null));
    let resolveFirst: ((response: Response) => void) | undefined;
    const firstResponse = new Promise<Response>((resolve) => { resolveFirst = resolve; });
    const fetchMock = vi.fn().mockReturnValueOnce(firstResponse).mockResolvedValueOnce(sentResponse());
    vi.stubGlobal('fetch', fetchMock);

    const delivery = deliverDueOutbox(2);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFirst?.(sentResponse());
    await delivery;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
