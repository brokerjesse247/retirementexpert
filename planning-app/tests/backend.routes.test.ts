import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireChallenge = vi.hoisted(() => vi.fn());
const consumeChallenge = vi.hoisted(() => vi.fn());
const createAdvisorSessionFromChallenge = vi.hoisted(() => vi.fn());
const enforceRateLimit = vi.hoisted(() => vi.fn());
const verifyTotp = vi.hoisted(() => vi.fn());
const consumeRecoveryCode = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({ draftAccessGrant: { findUnique: vi.fn() } }));

vi.mock('../lib/db', () => ({ db }));
vi.mock('../lib/auth/session', () => ({ requireChallenge, consumeChallenge, createAdvisorSessionFromChallenge }));
vi.mock('../lib/auth/rate-limit', () => ({ enforceRateLimit }));
vi.mock('../lib/auth/totp', () => ({ verifyTotp, consumeRecoveryCode }));

import { ApiError } from '../lib/auth/http';
import { POST as verifyMfa } from '../app/api/auth/verify/route';
import { POST as exchangeResumeGrant } from '../app/api/intake/resume/exchange/route';

describe('public auth route throttles', () => {
  const originalOrigin = process.env.APP_ORIGIN;

  beforeEach(() => {
    process.env.APP_ORIGIN = 'https://app.example.test';
    vi.clearAllMocks();
    consumeChallenge.mockResolvedValue(true);
  });

  afterEach(() => {
    process.env.APP_ORIGIN = originalOrigin;
  });

  it('consumes the MFA challenge and avoids TOTP work when its persistent cap is hit', async () => {
    requireChallenge.mockResolvedValue({
      challenge: {
        id: 'challenge-1', advisorId: 'advisor-1', csrfToken: 'csrf-token',
        advisor: { email: 'advisor@example.test', totpSecretEncrypted: 'encrypted-secret', recoveryCodeHashes: null },
      },
    });
    enforceRateLimit.mockRejectedValueOnce(new ApiError(429, 'Please wait before trying again.'));

    const response = await verifyMfa(new NextRequest('https://app.example.test/api/auth/verify', {
      method: 'POST',
      headers: { origin: 'https://app.example.test', 'content-type': 'application/json' },
      body: JSON.stringify({ csrfToken: 'csrf-token', code: '123456' }),
    }));

    expect(response.status).toBe(429);
    expect(enforceRateLimit).toHaveBeenCalledWith('mfa-verify-challenge', 'challenge-1', 5, 10 * 60_000);
    expect(consumeChallenge).toHaveBeenCalledWith('challenge-1');
    expect(verifyTotp).not.toHaveBeenCalled();
  });

  it('applies a public resume-exchange network throttle before looking up a grant token', async () => {
    enforceRateLimit.mockRejectedValueOnce(new ApiError(429, 'Please wait before trying again.'));

    const response = await exchangeResumeGrant(new NextRequest('https://app.example.test/api/intake/resume/exchange', {
      method: 'POST',
      headers: { origin: 'https://app.example.test', 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'opaque-resume-token' }),
    }));

    expect(response.status).toBe(429);
    expect(enforceRateLimit).toHaveBeenCalledWith('intake-resume-exchange-ip', 'untrusted-network', 15, 60 * 60_000);
    expect(db.draftAccessGrant.findUnique).not.toHaveBeenCalled();
  });
});
