import { describe, expect, it } from 'vitest';
import { ApiError } from '../lib/auth/http';
import { MemoryCronReplayStore, authorizeOperationsDispatch, dispatchOperationsJobs, dispatchOutboxIfApproved, signOperationsDispatch } from '../lib/operations/jobs';

function headers(values: Record<string, string>) {
  return { get: (name: string) => values[name.toLowerCase()] ?? null };
}

describe('operations dispatcher', () => {
  it('accepts one valid HMAC request and rejects a replay or expired signed request', async () => {
    const now = new Date();
    const secret = 'a'.repeat(32);
    const timestamp = String(now.valueOf());
    const nonce = 'nonce-for-dispatch-1234';
    const signature = signOperationsDispatch({ timestamp, nonce, secret });
    const store = new MemoryCronReplayStore();
    const requestHeaders = headers({ 'x-operations-timestamp': timestamp, 'x-operations-nonce': nonce, 'x-operations-signature': signature });
    await expect(authorizeOperationsDispatch({ headers: requestHeaders, replayStore: store, env: { OPERATIONS_CRON_HMAC_SECRET: secret }, now })).resolves.toBeUndefined();
    await expect(authorizeOperationsDispatch({ headers: requestHeaders, replayStore: store, env: { OPERATIONS_CRON_HMAC_SECRET: secret }, now })).rejects.toMatchObject({ status: 409 } satisfies Partial<ApiError>);

    const oldTimestamp = String(now.valueOf() - 300_001);
    const oldNonce = 'nonce-expired-request-123';
    const oldSignature = signOperationsDispatch({ timestamp: oldTimestamp, nonce: oldNonce, secret });
    await expect(authorizeOperationsDispatch({ headers: headers({ 'x-operations-timestamp': oldTimestamp, 'x-operations-nonce': oldNonce, 'x-operations-signature': oldSignature }), replayStore: new MemoryCronReplayStore(), env: { OPERATIONS_CRON_HMAC_SECRET: secret }, now })).rejects.toMatchObject({ status: 401 } satisfies Partial<ApiError>);
  });

  it('keeps delivery on hold unless explicit approval and provider attestation are present', async () => {
    const deliverDueOutbox = async () => ({ sent: 1, retry: 0, failed: 0 });
    await expect(dispatchOutboxIfApproved({ deliverDueOutbox, env: {} })).rejects.toMatchObject({ status: 423 } satisfies Partial<ApiError>);
    await expect(dispatchOutboxIfApproved({ deliverDueOutbox, env: { OPERATIONS_OUTBOX_DISPATCH_APPROVED: 'true' } })).rejects.toMatchObject({ status: 503 } satisfies Partial<ApiError>);
    await expect(dispatchOutboxIfApproved({ deliverDueOutbox, env: { OPERATIONS_OUTBOX_DISPATCH_APPROVED: 'true', HOSTINGER_MAIL_API_TOKEN: 'configured-not-exposed', HOSTINGER_MAIL_SENDER_VERIFIED: 'true' } })).resolves.toEqual({ sent: 1, retry: 0, failed: 0 });
  });

  it('runs private report queue work without sending mail while outbox delivery remains held', async () => {
    const deliverDueReports = async () => ({ processed: 2 });
    const deliverDueOutbox = async () => { throw new Error('email delivery must remain held'); };
    await expect(dispatchOperationsJobs({ env: {}, deliverDueReports, deliverDueOutbox })).resolves.toEqual({ reports: { processed: 2 }, outbox: { state: 'HELD' } });
  });
});
