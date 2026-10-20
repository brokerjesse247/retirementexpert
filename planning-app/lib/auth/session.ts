import { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { randomToken, tokenHash } from './crypto';
import { ADVISOR_COOKIE, ApiError, CHALLENGE_COOKIE, DRAFT_COOKIE, SESSION_IDLE_SECONDS } from './http';

export type AdvisorSessionContext = {
  sessionId: string;
  advisor: { id: string; name: string; email: string; phone: string | null; licenseNumbers: string | null; totpEnabledAt: Date | null };
  csrfToken: string;
};

type ChallengeSessionOptions = {
  recovery?: { expectedSerialized: string; remainingSerialized: string };
  enrollment?: { encryptedSecret: string; recoveryCodeHashes: string };
};

export async function createAdvisorSession(advisorId: string): Promise<{ token: string; csrfToken: string }> {
  const token = randomToken();
  const csrfToken = randomToken();
  const now = new Date();
  await db.advisorSession.create({
    data: { advisorId, tokenHash: tokenHash(token), csrfToken, lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_IDLE_SECONDS * 1000) },
  });
  return { token, csrfToken };
}

export async function getAdvisorSession(request: NextRequest): Promise<AdvisorSessionContext | null> {
  const token = request.cookies.get(ADVISOR_COOKIE)?.value;
  if (!token) return null;
  const now = new Date();
  const session = await db.advisorSession.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { advisor: { select: { id: true, name: true, email: true, phone: true, licenseNumbers: true, totpEnabledAt: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt <= now) {
    if (session && !session.revokedAt) await db.advisorSession.update({ where: { id: session.id }, data: { revokedAt: now } });
    return null;
  }
  return { sessionId: session.id, advisor: session.advisor, csrfToken: session.csrfToken };
}

/** Renew only after a same-origin, CSRF-protected intentional activity signal. */
export async function renewAdvisorSession(sessionId: string): Promise<boolean> {
  const now = new Date();
  const renewed = await db.advisorSession.updateMany({
    where: { id: sessionId, revokedAt: null, expiresAt: { gt: now } },
    data: { lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_IDLE_SECONDS * 1000) },
  });
  return Boolean(renewed.count);
}

export async function requireAdvisor(request: NextRequest): Promise<AdvisorSessionContext> {
  const context = await getAdvisorSession(request);
  if (!context) throw new ApiError(401, 'Authentication is required.');
  return context;
}

export async function revokeAdvisorSession(request: NextRequest): Promise<void> {
  const token = request.cookies.get(ADVISOR_COOKIE)?.value;
  if (token) await db.advisorSession.updateMany({ where: { tokenHash: tokenHash(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeAllAdvisorSessions(advisorId: string): Promise<void> {
  await db.advisorSession.updateMany({ where: { advisorId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function createChallenge(advisorId: string): Promise<{ token: string; csrfToken: string }> {
  const token = randomToken();
  const csrfToken = randomToken();
  await db.authChallenge.create({ data: { advisorId, tokenHash: tokenHash(token), csrfToken, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } });
  return { token, csrfToken };
}

export async function requireChallenge(request: NextRequest) {
  const token = request.cookies.get(CHALLENGE_COOKIE)?.value;
  if (!token) throw new ApiError(401, 'A password verification is required.');
  const challenge = await db.authChallenge.findUnique({ where: { tokenHash: tokenHash(token) }, include: { advisor: true } });
  if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date()) throw new ApiError(401, 'Your verification has expired.');
  return { token, challenge };
}

/** Best-effort invalidation used when an MFA throttle is exhausted. */
export async function consumeChallenge(id: string): Promise<boolean> {
  const consumed = await db.authChallenge.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: new Date() } });
  return Boolean(consumed.count);
}

/**
 * Claims an unexpired challenge exactly once and creates its session in the
 * same transaction. A recovery-code compare-and-set prevents two parallel
 * requests from accepting the same code. Enrollment writes are similarly
 * coupled to the one-use challenge.
 */
export async function createAdvisorSessionFromChallenge(
  challengeId: string,
  advisorId: string,
  options: ChallengeSessionOptions = {},
): Promise<{ token: string; csrfToken: string } | null> {
  const token = randomToken();
  const csrfToken = randomToken();
  const now = new Date();
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const claimed = await tx.authChallenge.updateMany({
      where: { id: challengeId, advisorId, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (!claimed.count) return null;

    if (options.recovery) {
      const consumedRecovery = await tx.advisor.updateMany({
        where: { id: advisorId, recoveryCodeHashes: options.recovery.expectedSerialized },
        data: { recoveryCodeHashes: options.recovery.remainingSerialized },
      });
      if (!consumedRecovery.count) throw new ApiError(401, 'Invalid authentication code.');
    }

    if (options.enrollment) {
      const enrolled = await tx.advisor.updateMany({
        where: { id: advisorId, totpEnabledAt: null },
        data: {
          totpSecretEncrypted: options.enrollment.encryptedSecret,
          recoveryCodeHashes: options.enrollment.recoveryCodeHashes,
          totpEnabledAt: now,
        },
      });
      if (!enrolled.count) throw new ApiError(409, 'Two-factor authentication is already enrolled.');
    }

    await tx.advisorSession.create({
      data: { advisorId, tokenHash: tokenHash(token), csrfToken, lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_IDLE_SECONDS * 1000) },
    });
    return { token, csrfToken };
  });
}

export async function getDraftSessionToken(request: NextRequest): Promise<string | null> {
  return request.cookies.get(DRAFT_COOKIE)?.value ?? null;
}
