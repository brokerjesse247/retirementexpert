import { OutboxStatus, Prisma } from '@prisma/client';
import { db } from '../db';
import { decryptJson, encryptJson, tokenHash } from '../auth/crypto';

const MAILBOX_ID = 'ACa3656503d597985bc359324043d7';
const API_BASE = 'https://api.mail.hostinger.com';
const SENDING_LEASE_MS = 15 * 60_000;

export type MailPayload = { to: string; displayName: string; subject: string; text: string; html: string };
type DbLike = Prisma.TransactionClient | typeof db;

/** Queue only: the API never claims a provider delivery before the worker receives HTTP 204. */
export async function queueEmail(payload: MailPayload, kind: string, advisorId?: string, client?: DbLike) {
  const recipient = payload.to.trim().toLowerCase();
  return (client ?? db).emailOutbox.create({
    data: { advisorId, kind, recipientHash: tokenHash(recipient), encryptedPayload: encryptJson({ ...payload, to: recipient }) },
  });
}

function senderIsVerified(): boolean {
  // Parent/setup must explicitly attest mailbox sender identity before the worker can transmit.
  return process.env.HOSTINGER_MAIL_SENDER_VERIFIED === 'true';
}

export async function sendHostinger(payload: MailPayload): Promise<void> {
  const token = process.env.HOSTINGER_MAIL_API_TOKEN;
  if (!token || !senderIsVerified()) throw new Error('MAIL_CONFIGURATION');
  const response = await fetch(`${API_BASE}/api/v1/mailboxes/${MAILBOX_ID}/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    // Documented send fields only; never perform mailbox/inbox reads.
    body: JSON.stringify({ to: payload.to, displayName: payload.displayName, subject: payload.subject, text: payload.text, html: payload.html }),
  });
  if (response.status !== 204) throw new Error(`MAIL_HTTP_${response.status}`);
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
  const claimed = await db.emailOutbox.updateMany({ where: { id, status: { in: [OutboxStatus.PENDING, OutboxStatus.RETRY] }, nextAttemptAt: { lte: new Date() } }, data: { status: OutboxStatus.SENDING } });
  if (!claimed.count) return 'skipped';
  const row = await db.emailOutbox.findUnique({ where: { id } });
  if (!row) return 'skipped';
  try {
    await sendHostinger(decryptJson<MailPayload>(row.encryptedPayload));
    const sent = await db.emailOutbox.updateMany({ where: { id, status: OutboxStatus.SENDING }, data: { status: OutboxStatus.SENT, sentAt: new Date(), attempts: { increment: 1 }, lastErrorCode: null } });
    return sent.count ? 'sent' : 'skipped';
  } catch (error) {
    const code = error instanceof Error && /^MAIL_(CONFIGURATION|HTTP_\d+)$/.test(error.message) ? error.message : 'MAIL_DELIVERY_UNCERTAIN';
    const attempts = row.attempts + 1;
    if (code === 'MAIL_DELIVERY_UNCERTAIN') {
      const failed = await db.emailOutbox.updateMany({ where: { id, status: OutboxStatus.SENDING }, data: { status: OutboxStatus.FAILED, attempts, lastErrorCode: code } });
      return failed.count ? 'failed' : 'skipped';
    }
    const terminal = attempts >= 8;
    const updated = await db.emailOutbox.updateMany({ where: { id, status: OutboxStatus.SENDING }, data: {
      status: terminal ? OutboxStatus.FAILED : OutboxStatus.RETRY,
      attempts,
      lastErrorCode: code,
      nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)),
    } });
    if (!updated.count) return 'skipped';
    return terminal ? 'failed' : 'retry';
  }
}

export async function deliverDueOutbox(limit = 25): Promise<{ sent: number; retry: number; failed: number }> {
  const leaseFailures = await failExpiredSendingLeases();
  const due = await db.emailOutbox.findMany({ where: { status: { in: [OutboxStatus.PENDING, OutboxStatus.RETRY] }, nextAttemptAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' }, take: limit, select: { id: true } });
  const results = await Promise.all(due.map((row: { id: string }) => deliverOutboxMessage(row.id)));
  return { sent: results.filter((result) => result === 'sent').length, retry: results.filter((result) => result === 'retry').length, failed: leaseFailures + results.filter((result) => result === 'failed').length };
}
