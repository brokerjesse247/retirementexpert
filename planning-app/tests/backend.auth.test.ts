import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => ({
  advisorSession: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
const tx = vi.hoisted(() => ({
  passwordResetToken: { findUnique: vi.fn(), updateMany: vi.fn() },
  advisor: { update: vi.fn() },
  advisorSession: { updateMany: vi.fn() },
  authChallenge: { updateMany: vi.fn() },
}));
const enforceRateLimit = vi.hoisted(() => vi.fn());
const hash = vi.hoisted(() => vi.fn());

vi.mock('../lib/db', () => ({ db }));
vi.mock('../lib/auth/rate-limit', () => ({ enforceRateLimit }));
vi.mock('bcryptjs', () => ({ default: { hash } }));

import { clientRateLimitKey } from '../lib/auth/http';
import { getAdvisorSession, renewAdvisorSession } from '../lib/auth/session';
import { POST as resetPassword } from '../app/api/auth/reset/route';

describe('auth session and reset hardening', () => {
  const originalOrigin = process.env.APP_ORIGIN;
  const originalTrustProxy = process.env.TRUST_PROXY_X_FORWARDED_FOR;

  beforeEach(() => {
    process.env.APP_ORIGIN = 'https://app.example.test';
    delete process.env.TRUST_PROXY_X_FORWARDED_FOR;
    vi.clearAllMocks();
    hash.mockResolvedValue('new-password-hash');
    db.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
  });

  afterEach(() => {
    process.env.APP_ORIGIN = originalOrigin;
    if (originalTrustProxy === undefined) delete process.env.TRUST_PROXY_X_FORWARDED_FOR;
    else process.env.TRUST_PROXY_X_FORWARDED_FOR = originalTrustProxy;
  });

  it('does not extend a valid session during GET validation, but renews it only explicitly', async () => {
    db.advisorSession.findUnique.mockResolvedValue({
      id: 'session-1', revokedAt: null, expiresAt: new Date(Date.now() + 60_000), csrfToken: 'csrf',
      advisor: { id: 'advisor-1', name: 'Advisor', email: 'advisor@example.test', phone: null, licenseNumbers: null, totpEnabledAt: new Date() },
    });
    const request = new NextRequest('https://app.example.test/api/auth/session', { headers: { cookie: 'rp_advisor_session=opaque' } });

    await expect(getAdvisorSession(request)).resolves.toMatchObject({ sessionId: 'session-1' });
    expect(db.advisorSession.update).not.toHaveBeenCalled();
    expect(db.advisorSession.updateMany).not.toHaveBeenCalled();

    db.advisorSession.updateMany.mockResolvedValue({ count: 1 });
    await expect(renewAdvisorSession('session-1')).resolves.toBe(true);
    expect(db.advisorSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'session-1', revokedAt: null, expiresAt: expect.objectContaining({ gt: expect.any(Date) }) }),
      data: expect.objectContaining({ expiresAt: expect.any(Date), lastSeenAt: expect.any(Date) }),
    }));
  });

  it('uses X-Forwarded-For only behind an explicitly trusted gateway and otherwise shares a conservative key', () => {
    const request = new NextRequest('https://app.example.test/api/intake/draft', { headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' } });
    expect(clientRateLimitKey(request)).toBe('untrusted-network');
    process.env.TRUST_PROXY_X_FORWARDED_FOR = 'true';
    expect(clientRateLimitKey(request)).toBe('ip:203.0.113.10');
  });

  it('consumes every active authentication challenge in the same reset transaction', async () => {
    tx.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1', advisorId: 'advisor-1', usedAt: null, expiresAt: new Date(Date.now() + 60_000),
    });
    tx.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    tx.advisor.update.mockResolvedValue({});
    tx.advisorSession.updateMany.mockResolvedValue({ count: 2 });
    tx.authChallenge.updateMany.mockResolvedValue({ count: 3 });

    const response = await resetPassword(new NextRequest('https://app.example.test/api/auth/reset', {
      method: 'POST',
      headers: { origin: 'https://app.example.test', 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'reset-token', password: 'a sufficiently long password' }),
    }));

    expect(response.status).toBe(200);
    expect(tx.authChallenge.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { advisorId: 'advisor-1', consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    }));
    expect(tx.advisorSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { advisorId: 'advisor-1', revokedAt: null },
    }));
  });
});
