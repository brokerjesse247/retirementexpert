import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateTemplateNarrative, validatedTemplateNarrative } from '../lib/narrative/templates';
import { generateOptionalAiNarrative } from '../lib/narrative/optional-ai';
import { unsafeNarrativeClaims, unsupportedNarrativeNumbers, validateNarrativeContent, wordCount } from '../lib/narrative/validation';
import type { ApprovedRecommendationFact } from '../lib/narrative/types';

const results: Record<string, unknown> = {
  netWorth: { netWorth: 500_000, totalInvestable: 420_000 },
  cashFlow: { portfolioAtRetirement: 700_000, incomeCoverageRatio: 0.75, depletionAge: 94.5, lifetimeFederalTax: 120_000, retirementYear: 2030, rows: [{ year: 2030, portfolioNeed: 33_000, endingBalance: 680_000, rmd: 0 }] },
  monteCarlo: { successPercent: 82.4, medianEnding: 460_000 }, readiness: { score: 72.3 }, taxes: { current: { federalTax: 18_000 } },
  healthcare: { lifetimeFutureCost: 220_000, hsaCoverageYears: 2.5 }, ltc: { costAt85: 150_000, coverageGap: 50_000, existingCoverage: 100_000 },
  estate: { insuranceNeed: 250_000, estateTaxFlag: { status: 'BELOW_REPORTED_THRESHOLD' } }, socialSecurity: { planned: { presentValue: 350_000 }, lifetimeDifference: 22_000 },
  roth: { noConversion: { totalRmd: 90_000 }, lifetimeTaxDifference: 15_000 }, allocation: { target: { currentEquity: 0.55, profile: 'MODERATE' } },
};
const recommendations: ApprovedRecommendationFact[] = [{ id: 'rec-1', title: 'Review $15,000 Roth conversion', body: 'The approved item uses a verified $15,000 amount.', nextStep: null, owner: null, targetDate: null, dollarImpact: null, impactLabel: null }];
const context = { firstName: 'Ada2', concerns: ['taxes', 'healthcare costs'], scenarioName: '2026 Plan', results, approvedRecommendations: recommendations };
const validationContext = { results, analysisMeta: { capturedAt: '2026-10-21T00:00:00.000Z' }, approvedRecommendations: recommendations };

describe('narrative templates and source-fact validation', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('creates a 150–250 word template letter and two-to-three-sentence sections from results only', () => {
    const content = generateTemplateNarrative(context);
    expect(wordCount(content.letter)).toBeGreaterThanOrEqual(150);
    expect(wordCount(content.letter)).toBeLessThanOrEqual(250);
    expect(content.letter).not.toContain('Ada2');
    expect(validateNarrativeContent(content, validationContext)).toEqual({ valid: true, content });
  });

  it('normalizes displayed money and percent fractions but rejects invented numeric claims', () => {
    const content = generateTemplateNarrative(context);
    expect(unsupportedNarrativeNumbers('The modeled income coverage is 75.0% and assets are $500,000.', validationContext)).toEqual([]);
    expect(unsupportedNarrativeNumbers('The saved analysis was captured on 2026-10-21, 10/21/2026, and October 21, 2026.', validationContext)).toEqual([]);
    const altered = { ...content, letter: content.letter.replace('$500,000', '$999,999') };
    const checked = validateNarrativeContent(altered, validationContext);
    expect(checked.valid).toBe(false);
    if (!checked.valid) expect(checked.unsupportedNumbers).toContain('$999,999');
  });

  it('falls back to a validated no-number template when analysis values are non-finite', () => {
    const invalidResults = { monteCarlo: { successPercent: Number.NaN } };
    const content = validatedTemplateNarrative({ ...context, results: invalidResults, approvedRecommendations: [] }, { results: invalidResults, approvedRecommendations: [] });
    expect(wordCount(content.letter)).toBeGreaterThanOrEqual(150);
    expect(validateNarrativeContent(content, { results: invalidResults, approvedRecommendations: [] }).valid).toBe(true);
  });

  it('rejects unsafe promised outcomes even when the number itself is sourced', () => {
    const content = generateTemplateNarrative(context);
    const altered = { ...content, letter: `${content.letter} This will guarantee a $500,000 outcome.` };
    const checked = validateNarrativeContent(altered, validationContext);
    expect(checked.valid).toBe(false);
    expect(unsafeNarrativeClaims(altered.letter)).toContain('guaranteed outcome language');
  });

  it('leaves optional AI disabled and makes no provider call without explicit runtime configuration', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await generateOptionalAiNarrative({ requested: true, dataSharingApproved: true, firstName: 'Ada', concerns: ['taxes'], facts: [], approvedRecommendations: [] });
    expect(result.used).toBe(false);
    expect(result.reason).toMatch(/disabled by runtime configuration/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
