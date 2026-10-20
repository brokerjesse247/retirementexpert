import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { randomToken, tokenHash } from './crypto';
import { ADVISOR_COOKIE, ApiError, DRAFT_COOKIE, SESSION_IDLE_SECONDS } from './http';

export type AdvisorSessionContext = {
  sessionId: string;
  advisor: { id: string; name: string; email: string; phone: string | null; licenseNumbers: string | null };
  csrfToken: string;
};

/** Call only after the account's actual password has been verified. */
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
    include: { advisor: { select: { id: true, name: true, email: true, phone: true, licenseNumbers: true } } },
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

export async function getDraftSessionToken(request: NextRequest): Promise<string | null> {
  return request.cookies.get(DRAFT_COOKIE)?.value ?? null;
}
