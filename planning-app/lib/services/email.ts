import { OutboxStatus, Prisma } from '@prisma/client';
import { db } from '../db';
import { decryptJson, encryptJson, tokenHash } from '../auth/crypto';
import { HOSTINGER_MAIL_API_BASE, HOSTINGER_MAILBOX_ID } from '../operations/status';

const SENDING_LEASE_MS = 15 * 60_000;
const SEND_TIMEOUT_MS = 10_000;
const MAX_RETRY_AFTER_MS = 24 * 60 * 60_000;

/** The sole currently approved recipient for every portal-generated message. */
export const APPROVED_MAIL_DESTINATION = 'brokerjesse247@gmail.com';

export type MailPayload = { to: string; displayName: string; subject: string; text: string; html: string };
type DbLike = Prisma.TransactionClient | typeof db;

function approvedMailDestination(): string {
  // Do not derive this from a request, encrypted legacy payload, or environment.
  return APPROVED_MAIL_DESTINATION;
}

/** Queue only: the API never claims a provider delivery before the worker receives HTTP 204. */
export async function queueEmail(payload: MailPayload, kind: string, advisorId?: string, client?: DbLike) {
  const recipient = approvedMailDestination();
  return (client ?? db).emailOutbox.create({
    data: { advisorId, kind, recipientHash: tokenHash(recipient), encryptedPayload: encryptJson({ ...payload, to: recipient }) },
  });
}

function senderIsVerified(): boolean {
  // Parent/setup must explicitly attest mailbox sender identity before the worker can transmit.
  return process.env.HOSTINGER_MAIL_SENDER_VERIFIED === 'true';
}

class MailDeliveryError extends Error {
  constructor(code: string, readonly retryable: boolean, readonly retryAfterMs?: number) {
    super(code);
    this.name = 'MailDeliveryError';
  }
}

function boundedRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) ? Math.min(MAX_RETRY_AFTER_MS, seconds * 1000) : undefined;
  }
  const retryAt = Date.parse(trimmed);
  return Number.isFinite(retryAt) ? Math.min(MAX_RETRY_AFTER_MS, Math.max(0, retryAt - Date.now())) : undefined;
}

export async function sendHostinger(payload: MailPayload): Promise<void> {
  const token = process.env.HOSTINGER_MAIL_API_TOKEN;
  if (!token || !senderIsVerified()) throw new Error('MAIL_CONFIGURATION');
  const recipient = approvedMailDestination();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetch(`${HOSTINGER_MAIL_API_BASE}/api/v1/mailboxes/${HOSTINGER_MAILBOX_ID}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      // Documented send fields only; never perform mailbox/inbox reads.
      body: JSON.stringify({ to: [recipient], displayName: payload.displayName, subject: payload.subject, text: payload.text, html: payload.html }),
      signal: controller.signal,
    });
    // Do not infer provider acceptance from any status other than the documented 204.
    if (response.status !== 204) {
      const retryable = response.status === 429 || (response.status >= 500 && response.status <= 599);
      throw new MailDeliveryError(`MAIL_HTTP_${response.status}`, retryable, retryable ? boundedRetryAfterMs(response.headers.get('Retry-After')) : undefined);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function retryDelayMs(attempt: number) {
  return Math.min(24 * 60 * 60 * 1000, 60_000 * 2 ** Math.min(attempt, 10));
}

/**
 * A killed worker can leave a message in SENDING. Hostinger's send endpoint
 * has no idempotency key, so a stale lease is failed for manual review rather
 * than blindly resent after an ambiguous provider timeout.
 */
async function failExpiredSendingLeases(): Promise<number> {
  const expired = await db.emailOutbox.updateMany({
    where: { status: OutboxStatus.SENDING, updatedAt: { lte: new Date(Date.now() - SENDING_LEASE_MS) } },
    data: { status: OutboxStatus.FAILED, attempts: { increment: 1 }, lastErrorCode: 'MAIL_DELIVERY_UNCERTAIN' },
  });
  return expired.count;
}

/** Claims and sends exactly one durable outbox message. Safe to run from a cron/process worker. */
export async function deliverOutboxMessage(id: string): Promise<'sent' | 'retry' | 'failed' | 'skipped'> {
  const recipient = approvedMailDestination();
  const claimed = await db.emailOutbox.updateMany({
    where: { id, status: { in: [OutboxStatus.PENDING, OutboxStatus.RETRY] }, nextAttemptAt: { lte: new Date() } },
    // Bring pre-policy rows' recorded recipient into alignment before transmission.
    data: { status: OutboxStatus.SENDING, recipientHash: tokenHash(recipient) },
  });
  if (!claimed.count) return 'skipped';
  const row = await db.emailOutbox.findUnique({ where: { id } });
  if (!row) return 'skipped';
  try {
    // Resolve again rather than trusting an old encrypted payload's recipient.
    await sendHostinger({ ...decryptJson<MailPayload>(row.encryptedPayload), to: recipient });
    const sent = await db.emailOutbox.updateMany({ where: { id, status: OutboxStatus.SENDING }, data: { status: OutboxStatus.SENT, sentAt: new Date(), attempts: { increment: 1 }, lastErrorCode: null } });
    return sent.count ? 'sent' : 'skipped';
  } catch (error) {
    const code = error instanceof Error && /^MAIL_(CONFIGURATION|HTTP_\d+)$/.test(error.message) ? error.message : 'MAIL_DELIVERY_UNCERTAIN';
    const attempts = row.attempts + 1;
    const retryable = error instanceof MailDeliveryError && error.retryable;
    if (!retryable) {
      const failed = await db.emailOutbox.updateMany({ where: { id, status: OutboxStatus.SENDING }, data: { status: OutboxStatus.FAILED, attempts, lastErrorCode: code } });
      return failed.count ? 'failed' : 'skipped';
    }
    const terminal = attempts >= 8;
    const updated = await db.emailOutbox.updateMany({ where: { id, status: OutboxStatus.SENDING }, data: {
      status: terminal ? OutboxStatus.FAILED : OutboxStatus.RETRY,
      attempts,
      lastErrorCode: code,
      nextAttemptAt: new Date(Date.now() + (error.retryAfterMs ?? retryDelayMs(attempts))),
    } });
    if (!updated.count) return 'skipped';
    return terminal ? 'failed' : 'retry';
  }
}

export async function deliverDueOutbox(limit = 2): Promise<{ sent: number; retry: number; failed: number }> {
  const leaseFailures = await failExpiredSendingLeases();
  const boundedLimit = Number.isFinite(limit) ? Math.min(10, Math.max(1, Math.floor(limit))) : 2;
  const due = await db.emailOutbox.findMany({ where: { status: { in: [OutboxStatus.PENDING, OutboxStatus.RETRY] }, nextAttemptAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' }, take: boundedLimit, select: { id: true } });
  const totals = { sent: 0, retry: 0, failed: leaseFailures };
  // Sequential processing deliberately bounds outbound provider calls in a worker pass.
  for (const row of due) {
    const result = await deliverOutboxMessage(row.id);
    if (result === 'sent') totals.sent += 1;
    if (result === 'retry') totals.retry += 1;
    if (result === 'failed') totals.failed += 1;
  }
  return totals;
}
