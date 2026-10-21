import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  recommendation: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), aggregate: vi.fn() },
  advisorNarrative: { updateMany: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
const ownedClient = vi.hoisted(() => vi.fn());
const loadScenarioAnalysis = vi.hoisted(() => vi.fn());
vi.mock('../lib/db', () => ({ db }));
vi.mock('../lib/calculations/service', () => ({ baseScenarioId: (clientId: string) => `base-${clientId}`, ownedClient }));
vi.mock('../lib/scenarios/service', () => ({ loadScenarioAnalysis }));
vi.mock('../lib/auth/crypto', () => ({ encryptJson: (value: unknown) => JSON.stringify(value), decryptJson: <T>(value: string) => JSON.parse(value) as T }));

import { ApiError } from '../lib/auth/http';
import { approvedRecommendations, listRecommendations, updateRecommendation } from '../lib/recommendations/service';

const content = {
  title: 'Action', body: 'Evidence-based action.', nextStep: 'Review it.', owner: 'Advisor', targetDate: null,
  dollarImpact: null, impactLabel: null, lsrtHelp: 'Optional help.', generated: true, custom: false,
  evidence: { ruleId: 'R01', category: 'Income', priority: 'HIGH', trigger: 'test', eligible: true, evidence: [], unavailable: [] },
};
const row = { id: 'recommendation-1', clientId: 'client-1', ruleId: 'R01', priority: 'HIGH', category: 'Income', encryptedContent: JSON.stringify(content), status: 'APPROVED', sortOrder: 0, scenarioId: 'base-client-1', sourceAnalysisId: 'old-analysis', revision: 4, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01') };
const snapshot = { input: {}, assumptions: {}, results: { monteCarlo: { successPercent: 100 }, cashFlow: { incomeCoverageRatio: null }, socialSecurity: {}, roth: {}, netWorth: {}, ltc: {}, estate: {}, allocation: {}, healthcare: {} }, warnings: [], meta: { engineVersion: 'test', assumptionsVersion: 'test', inputRevision: 1, seed: 1, cacheKey: 'test', capturedAt: '2026-01-01' } };

beforeEach(() => {
  vi.clearAllMocks();
  ownedClient.mockResolvedValue({ id: 'client-1', revision: 1 });
  loadScenarioAnalysis.mockResolvedValue({ id: 'current-analysis', snapshot, scenarioId: 'base-client-1', scenarioName: 'Base plan' });
  db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
  db.recommendation.findUniqueOrThrow.mockResolvedValue({ ...row, status: 'EDITED', sourceAnalysisId: 'current-analysis', revision: 5, encryptedContent: JSON.stringify({ ...content, generated: false }) });
});

describe('recommendation service authorization and approval lineage', () => {
  it('does not query recommendation records for an actor who does not own the client', async () => {
    ownedClient.mockRejectedValueOnce(new ApiError(404, 'Client not found.'));
    await expect(listRecommendations('client-1', 'other-advisor')).rejects.toMatchObject({ status: 404 });
    expect(db.recommendation.findMany).not.toHaveBeenCalled();
  });

  it('blocks approval of a proposal whose source analysis is stale', async () => {
    db.recommendation.findFirst.mockResolvedValue(row);
    await expect(updateRecommendation({ clientId: 'client-1', advisorId: 'advisor-1', recommendationId: row.id, revision: 4, action: 'approve' })).rejects.toMatchObject({ status: 409 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('edits against the current analysis and changes APPROVED to EDITED, clearing report approval', async () => {
    db.recommendation.findFirst.mockResolvedValue({ ...row, sourceAnalysisId: 'current-analysis' });
    db.recommendation.updateMany.mockResolvedValue({ count: 1 });
    const updated = await updateRecommendation({ clientId: 'client-1', advisorId: 'advisor-1', recommendationId: row.id, revision: 4, action: 'edit', content: { title: 'Edited', body: 'Edited body.', nextStep: 'Review.', owner: 'Advisor', targetDate: null, dollarImpact: null, impactLabel: null, lsrtHelp: null } });
    expect(db.recommendation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'EDITED', sourceAnalysisId: 'current-analysis', revision: { increment: 1 } }) }));
    expect(updated.status).toBe('EDITED');
    expect(updated.reportEligible).toBe(false);
    expect(db.advisorNarrative.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ clientId: 'client-1', scenarioId: 'base-client-1' }), data: { approvedAt: null, revision: { increment: 1 } } }));
  });

  it('excludes non-matching analysis lineage from report output and makes LSRT help opt-in', async () => {
    db.recommendation.findMany.mockResolvedValue([]);
    await expect(approvedRecommendations('client-1', 'advisor-1', 'current-analysis', 'base-client-1', false)).resolves.toEqual([]);
    expect(db.recommendation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ clientId: 'client-1', scenarioId: 'base-client-1', sourceAnalysisId: 'current-analysis', status: 'APPROVED' }) }));
  });
});
