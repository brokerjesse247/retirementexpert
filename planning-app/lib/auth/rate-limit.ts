import { db } from '@/lib/db';
import { tokenHash } from './crypto';
import { ApiError } from './http';

/** Persistent fixed-window throttling. Keys are hashed so IP/email values are not stored in clear text. */
export async function enforceRateLimit(scope: string, key: string, limit: number, windowMs: number): Promise<void> {
  const now = new Date();
  const hashed = tokenHash(`${scope}:${key.toLowerCase()}`);
  const cutoff = new Date(now.getTime() - windowMs);

  // The conditional increment is the normal path. It prevents parallel
  // requests from both observing the same count and passing the limit.
  const incremented = await db.rateLimit.updateMany({
    where: { scope, keyHash: hashed, windowStart: { gt: cutoff }, blockedUntil: null, count: { lt: limit } },
    data: { count: { increment: 1 } },
  });
  if (incremented.count) return;

  let current = await db.rateLimit.findUnique({ where: { scope_keyHash: { scope, keyHash: hashed } } });
  if (!current) {
    try {
      await db.rateLimit.create({ data: { scope, keyHash: hashed, count: 1, windowStart: now } });
      return;
    } catch {
      // Another request created this unique row. Re-read below and fail closed
      // if it cannot be accounted for in the current window.
      current = await db.rateLimit.findUnique({ where: { scope_keyHash: { scope, keyHash: hashed } } });
      if (!current) throw new ApiError(429, 'Please wait before trying again.');
    }
  }

  if (current.windowStart.getTime() <= cutoff.getTime()) {
    const reset = await db.rateLimit.updateMany({
      where: { id: current.id, windowStart: { lte: cutoff } },
      data: { count: 1, windowStart: now, blockedUntil: null },
    });
    if (reset.count) return;
    current = await db.rateLimit.findUnique({ where: { scope_keyHash: { scope, keyHash: hashed } } });
    if (!current) throw new ApiError(429, 'Please wait before trying again.');
  }

  if (current.blockedUntil && current.blockedUntil > now) throw new ApiError(429, 'Please wait before trying again.');

  // The limit was reached concurrently or is already exhausted. Mark the
  // record blocked through the end of its existing window; no extra attempt is
  // counted after the cap.
  const blocked = await db.rateLimit.updateMany({
    where: { id: current.id, windowStart: { gt: cutoff }, blockedUntil: null, count: { gte: limit } },
    data: { blockedUntil: new Date(current.windowStart.getTime() + windowMs) },
  });
  if (blocked.count) throw new ApiError(429, 'Please wait before trying again.');

  // A concurrent increment/reset won the race. A retry is deliberately
  // throttled rather than allowing an unbounded optimistic loop.
  throw new ApiError(429, 'Please wait before trying again.');
}
