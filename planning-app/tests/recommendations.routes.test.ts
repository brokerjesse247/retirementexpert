import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireAdvisor = vi.hoisted(() => vi.fn());
const listRecommendations = vi.hoisted(() => vi.fn());
const refreshRecommendations = vi.hoisted(() => vi.fn());
const createCustomRecommendation = vi.hoisted(() => vi.fn());
const updateRecommendation = vi.hoisted(() => vi.fn());
vi.mock('../lib/auth/session', () => ({ requireAdvisor }));
vi.mock('../lib/recommendations/service', () => ({ listRecommendations, refreshRecommendations, createCustomRecommendation, updateRecommendation }));

import { ApiError } from '../lib/auth/http';
import { GET, POST } from '../app/api/clients/[id]/recommendations/route';
import { PATCH } from '../app/api/clients/[id]/recommendations/[recommendationId]/route';

const context = { params: Promise.resolve({ id: 'client-1' }) };
const itemContext = { params: Promise.resolve({ id: 'client-1', recommendationId: 'recommendation-1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('APP_ORIGIN', 'https://app.example.test');
  requireAdvisor.mockResolvedValue({ advisor: { id: 'advisor-1' }, csrfToken: 'valid-csrf' });
});
afterEach(() => vi.unstubAllEnvs());

describe('recommendation API security', () => {
  it('returns the service ownership 404 for an authenticated actor without this client', async () => {
    listRecommendations.mockRejectedValueOnce(new ApiError(404, 'Client not found.'));
    const response = await GET(new NextRequest('https://app.example.test/api/clients/client-1/recommendations'), context);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Client not found.' });
    expect(listRecommendations).toHaveBeenCalledWith('client-1', 'advisor-1', undefined);
  });

  it('requires a matching CSRF token before refresh or custom persistence', async () => {
    const response = await POST(new NextRequest('https://app.example.test/api/clients/client-1/recommendations', {
      method: 'POST', headers: { origin: 'https://app.example.test', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'refresh', clientRevision: 1, csrfToken: 'wrong-token' }),
    }), context);
    expect(response.status).toBe(403);
    expect(refreshRecommendations).not.toHaveBeenCalled();
    expect(createCustomRecommendation).not.toHaveBeenCalled();
  });

  it('propagates a stale optimistic recommendation revision as 409', async () => {
    updateRecommendation.mockRejectedValueOnce(new ApiError(409, 'This recommendation changed elsewhere. Reload before saving.'));
    const response = await PATCH(new NextRequest('https://app.example.test/api/clients/client-1/recommendations/recommendation-1', {
      method: 'PATCH', headers: { origin: 'https://app.example.test', 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'remove', revision: 3, csrfToken: 'valid-csrf' }),
    }), itemContext);
    expect(response.status).toBe(409);
    expect(updateRecommendation).toHaveBeenCalledWith(expect.objectContaining({ advisorId: 'advisor-1', revision: 3, action: 'remove' }));
  });
});
