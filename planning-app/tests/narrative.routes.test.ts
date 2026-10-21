import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const requireAdvisor = vi.hoisted(() => vi.fn());
const enforceRateLimit = vi.hoisted(() => vi.fn());
const generateNarrative = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/session', () => ({ requireAdvisor }));
vi.mock('@/lib/auth/rate-limit', () => ({ enforceRateLimit }));
vi.mock('@/lib/narrative/service', () => ({ generateNarrative, getNarrative: vi.fn(), saveNarrativeDraft: vi.fn() }));
import { POST } from '../app/api/clients/[id]/narrative/route';

describe('narrative route security', () => {
  beforeEach(() => {
    vi.stubEnv('APP_ORIGIN', 'https://app.example.test'); vi.clearAllMocks();
    requireAdvisor.mockResolvedValue({ advisor: { id: 'advisor-1' }, csrfToken: 'csrf-good' });
    generateNarrative.mockResolvedValue({ analysisId: 'analysis-1', scenarioId: 'base-1', narrative: null });
  });
  afterEach(() => vi.unstubAllEnvs());
  it('requires the session CSRF token before generation while applying the advisor rate limit', async () => {
    const request = new NextRequest('https://app.example.test/api/clients/client-1/narrative', { method: 'POST', headers: { origin: 'https://app.example.test', 'content-type': 'application/json' }, body: JSON.stringify({ analysisId: 'analysis-1', revision: 0, csrfToken: 'wrong' }) });
    const response = await POST(request, { params: Promise.resolve({ id: 'client-1' }) });
    expect(response.status).toBe(403);
    expect(enforceRateLimit).toHaveBeenCalledWith('narrative-generate', 'advisor-1:untrusted-network', 12, 60 * 60_000);
    expect(generateNarrative).not.toHaveBeenCalled();
  });
});
