import crypto from 'node:crypto';
import { ApiError } from '@/lib/auth/http';
import { constantTimeEqual } from '@/lib/auth/crypto';

export const OPERATIONS_CRON_TTL_MS = 5 * 60_000;
type Environment = Record<string, string | undefined>;

export type CronReplayStore = {
  consumeOnce: (fingerprint: string, expiresAt: Date) => Promise<boolean>;
};

type HeaderSource = { get(name: string): string | null };

function cronSecret(env: Environment): string {
  const secret = env.OPERATIONS_CRON_HMAC_SECRET;
  if (!secret || secret.length < 32) throw new ApiError(503, 'Operations dispatcher authentication is not configured.');
  return secret;
}

function signingPayload(timestamp: string, nonce: string, method: string, pathname: string): string {
  return `${timestamp}.${nonce}.${method.toUpperCase()}.${pathname}`;
}

export function signOperationsDispatch(args: { timestamp: string; nonce: string; method?: string; pathname?: string; secret: string }): string {
  return crypto.createHmac('sha256', args.secret).update(signingPayload(args.timestamp, args.nonce, args.method ?? 'POST', args.pathname ?? '/api/operations/dispatch')).digest('base64url');
}

function validNonce(nonce: string | null): nonce is string {
  return Boolean(nonce && /^[A-Za-z0-9_-]{16,128}$/.test(nonce));
}

/** A test/development store only. Production must use a schema-backed atomic unique key. */
export class MemoryCronReplayStore implements CronReplayStore {
  private readonly values = new Map<string, number>();

  async consumeOnce(fingerprint: string, expiresAt: Date): Promise<boolean> {
    const now = Date.now();
    for (const [key, expiry] of this.values) if (expiry <= now) this.values.delete(key);
    if (this.values.has(fingerprint)) return false;
    this.values.set(fingerprint, expiresAt.valueOf());
    return true;
  }
}

export async function authorizeOperationsDispatch(args: {
  headers: HeaderSource;
  method?: string;
  pathname?: string;
  env?: Environment;
  replayStore: CronReplayStore;
  now?: Date;
}): Promise<void> {
  const env = args.env ?? process.env;
  const timestamp = args.headers.get('x-operations-timestamp');
  const nonce = args.headers.get('x-operations-nonce');
  const signature = args.headers.get('x-operations-signature');
  if (!timestamp || !validNonce(nonce) || !signature) throw new ApiError(401, 'Operations dispatcher authentication failed.');
  const issuedAt = Number(timestamp);
  const now = (args.now ?? new Date()).valueOf();
  if (!Number.isSafeInteger(issuedAt) || Math.abs(now - issuedAt) > OPERATIONS_CRON_TTL_MS) throw new ApiError(401, 'Operations dispatcher request expired.');
  const expected = signOperationsDispatch({ timestamp, nonce, method: args.method, pathname: args.pathname, secret: cronSecret(env) });
  if (!constantTimeEqual(expected, signature)) throw new ApiError(401, 'Operations dispatcher authentication failed.');
  const fingerprint = crypto.createHash('sha256').update(signature).digest('hex');
  const accepted = await args.replayStore.consumeOnce(fingerprint, new Date(issuedAt + OPERATIONS_CRON_TTL_MS));
  if (!accepted) throw new ApiError(409, 'Operations dispatcher request was already used.');
}

export function productionReplayStoreAvailable(env: Environment = process.env): boolean {
  // No production implementation is allowed until the parent applies the required unique-key schema.
  return env.NODE_ENV !== 'production';
}

export async function dispatchOutboxIfApproved(args: {
  env?: Environment;
  deliverDueOutbox: (limit: number) => Promise<{ sent: number; retry: number; failed: number }>;
}): Promise<{ sent: number; retry: number; failed: number }> {
  const env = args.env ?? process.env;
  if (env.OPERATIONS_OUTBOX_DISPATCH_APPROVED !== 'true') throw new ApiError(423, 'Outbound delivery dispatcher is on hold.');
  if (!env.HOSTINGER_MAIL_API_TOKEN || env.HOSTINGER_MAIL_SENDER_VERIFIED !== 'true') {
    throw new ApiError(503, 'Outbound delivery provider is not verified.');
  }
  const requested = Number(env.OPERATIONS_OUTBOX_LIMIT ?? '25');
  const limit = Number.isInteger(requested) && requested > 0 ? Math.min(requested, 100) : 25;
  return args.deliverDueOutbox(limit);
}

/** Report generation is private queue work, not report delivery or client email. */
export async function dispatchOperationsJobs(args: {
  env?: Environment;
  deliverDueReports: (limit: number) => Promise<{ processed: number }>;
  deliverDueOutbox: (limit: number) => Promise<{ sent: number; retry: number; failed: number }>;
}): Promise<{ reports: { processed: number }; outbox: { state: 'HELD' } | { state: 'DISPATCHED'; sent: number; retry: number; failed: number } }> {
  const reports = await args.deliverDueReports(2);
  if ((args.env ?? process.env).OPERATIONS_OUTBOX_DISPATCH_APPROVED !== 'true') return { reports, outbox: { state: 'HELD' } };
  const outbox = await dispatchOutboxIfApproved(args);
  return { reports, outbox: { state: 'DISPATCHED', ...outbox } };
}
