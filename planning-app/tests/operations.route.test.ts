import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAdvisor = vi.hoisted(() => vi.fn());
const groupBy = vi.hoisted(() => vi.fn());
vi.mock('../lib/auth/session', () => ({ requireAdvisor }));
vi.mock('../lib/db', () => ({ db: { emailOutbox: { groupBy } } }));

import { ApiError } from '../lib/auth/http';
import { GET } from '../app/api/operations/status/route';

describe('operations status route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.HOSTINGER_MAIL_API_TOKEN;
    groupBy.mockResolvedValue([{ status: 'PENDING', _count: { _all: 3 } }, { status: 'FAILED', _count: { _all: 2 } }]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('fails closed when no advisor session is present', async () => {
    requireAdvisor.mockRejectedValue(new ApiError(401, 'Authentication is required.'));
    const response = await GET(new NextRequest('https://plan.example.test/api/operations/status'));
    expect(response.status).toBe(401);
    expect(groupBy).not.toHaveBeenCalled();
  });

  it('returns no-store aggregate-only state for an authenticated advisor', async () => {
    requireAdvisor.mockResolvedValue({ advisor: { id: 'advisor', email: 'advisor@example.test' } });
    const response = await GET(new NextRequest('https://plan.example.test/api/operations/status'));
    const body = await response.json();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.status.outbox).toEqual({ pending: 3, failed: 2 });
    expect(JSON.stringify(body)).not.toContain('advisor@example.test');
    expect(JSON.stringify(body)).not.toContain('recipient');
  });
});
