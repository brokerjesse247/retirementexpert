import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateTemplateNarrative } from '../lib/narrative/templates';

const db = vi.hoisted(() => ({ advisorNarrative: { findUnique: vi.fn() }, recommendation: { findMany: vi.fn() } }));
const decryptJson = vi.hoisted(() => vi.fn());
const loadAnalysis = vi.hoisted(() => vi.fn());
const ownedClient = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ db }));
vi.mock('@/lib/auth/crypto', () => ({ decryptJson, encryptJson: vi.fn() }));
vi.mock('@/lib/calculations/service', () => ({ baseScenarioId: () => 'base-client-1', loadAnalysis, ownedClient }));
import { approvedNarrative } from '../lib/narrative/service';

const results: Record<string, unknown> = { netWorth: { netWorth: 500_000 }, cashFlow: { portfolioAtRetirement: 700_000 }, monteCarlo: { successPercent: 80 }, readiness: { score: 70 } };
const content = generateTemplateNarrative({ firstName: 'Ada', concerns: ['taxes'], scenarioName: 'Base plan', results, approvedRecommendations: [] });
const row = { id: 'narrative-1', clientId: 'client-1', scenarioId: 'base-client-1', sourceAnalysisId: 'analysis-current', encryptedContent: 'narrative-content', approvedAt: new Date('2026-10-21T00:00:00.000Z'), revision: 1, createdAt: new Date(), updatedAt: new Date() };

describe('approvedNarrative export guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ownedClient.mockResolvedValue({ id: 'client-1', firstName: 'Ada', encryptedData: 'intake' });
    loadAnalysis.mockResolvedValue({ id: 'analysis-current', snapshot: { results, meta: { capturedAt: '2026-10-21T00:00:00.000Z' } } });
    decryptJson.mockImplementation((value: string) => value === 'narrative-content' ? content : { rankedConcerns: ['TAXES'] });
    db.recommendation.findMany.mockResolvedValue([]);
  });

  it('excludes an approved row when the caller asks for an old analysis', async () => {
    await expect(approvedNarrative('client-1', 'advisor-1', 'analysis-old')).resolves.toBeNull();
    expect(db.advisorNarrative.findUnique).not.toHaveBeenCalled();
  });

  it('excludes unapproved narrative text even when the analysis matches', async () => {
    db.advisorNarrative.findUnique.mockResolvedValue({ ...row, approvedAt: null });
    await expect(approvedNarrative('client-1', 'advisor-1', 'analysis-current')).resolves.toBeNull();
  });

  it('returns only a current, approved, text-valid narrative export', async () => {
    db.advisorNarrative.findUnique.mockResolvedValue(row);
    const exported = await approvedNarrative('client-1', 'advisor-1', 'analysis-current');
    expect(exported).toMatchObject({ letter: content.letter, sections: content.sections, sourceAnalysisId: 'analysis-current', scenarioId: 'base-client-1' });
  });
});
