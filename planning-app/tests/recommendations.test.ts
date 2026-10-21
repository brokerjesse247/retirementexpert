import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS } from '../lib/assumptions/defaults';
import { runAnalysis } from '../lib/calculations/engine';
import { generateRecommendations } from '../lib/recommendations/generate';
import { RULE_IDS } from '../lib/recommendations/types';
import { sarahThompsonFixture } from './fixtures/section-14-sample-households';

const sarahCalculated = runAnalysis(sarahThompsonFixture.planningInput, DEFAULT_ASSUMPTIONS);

function sarahSnapshot() {
  const calculated = sarahCalculated;
  return {
    input: sarahThompsonFixture.planningInput,
    assumptions: DEFAULT_ASSUMPTIONS,
    results: structuredClone(calculated.results),
    warnings: calculated.warnings,
    meta: { engineVersion: calculated.engineVersion, assumptionsVersion: DEFAULT_ASSUMPTIONS.version, inputRevision: 1, seed: calculated.seed, cacheKey: 'recommendation-test', capturedAt: '2026-01-15T00:00:00.000Z', scenario: { id: 'test-scenario', name: 'Test scenario', revision: 1, options: {} } },
  };
}

describe('recommendation generation', () => {
  it('represents each documented rule and retains Sarah’s exact sourced tax-free ratio without forcing unsupported facts', () => {
    const snapshot = sarahSnapshot();
    const result = generateRecommendations(snapshot, {}, { runSolvers: false });
    expect(result.evaluations.map((evaluation) => evaluation.ruleId)).toEqual(RULE_IDS);
    const r07 = result.evaluations.find((evaluation) => evaluation.ruleId === 'R07')!;
    expect(r07.eligible).toBe(true);
    // $25,000 Roth divided by $140,000 pretax + $25,000 Roth + $8,000 cash = 14.450867…%, not a golden recommendation list.
    expect(snapshot.results.netWorth.taxFree / snapshot.results.netWorth.taxDiversification.includedBalance).toBeCloseTo(25_000 / 173_000, 12);
    expect(r07.evidence.find((fact) => fact.label === 'Tax-free share')?.value).toBe('14.5%');
    expect(result.evaluations.find((evaluation) => evaluation.ruleId === 'R02')?.unavailable.join(' ')).toMatch(/Essential monthly spending is not supplied/);
    expect(result.evaluations.find((evaluation) => evaluation.ruleId === 'R15')?.unavailable.join(' ')).toMatch(/validated supplemental facts/);
    expect(result.evaluations.find((evaluation) => evaluation.ruleId === 'R16')?.unavailable.join(' ')).toMatch(/unknown/i);
  });

  it('uses the strict R01 threshold and exposes a bounded-solver unavailable state instead of inventing levers', () => {
    const snapshot = sarahSnapshot();
    snapshot.results.monteCarlo.successPercent = 69.99;
    const below = generateRecommendations(snapshot, {}, { runSolvers: false });
    const r01 = below.evaluations.find((evaluation) => evaluation.ruleId === 'R01')!;
    expect(r01.eligible).toBe(true);
    expect(r01.solverEvidence?.[0]).toMatchObject({ status: 'UNAVAILABLE', targetSuccessPercent: 85 });
    snapshot.results.monteCarlo.successPercent = 70;
    const atThreshold = generateRecommendations(snapshot, {}, { runSolvers: false });
    expect(atThreshold.evaluations.find((evaluation) => evaluation.ruleId === 'R01')?.eligible).toBe(false);
  });

  it('does not fabricate an annuity premium, payout, match schedule, HSA contribution, or catch-up figure', () => {
    const result = generateRecommendations(sarahSnapshot(), {}, { runSolvers: false });
    const r02 = result.proposals.find((proposal) => proposal.ruleId === 'R02');
    expect(r02).toBeUndefined(); // Essential-spending fact is deliberately unknown in the sample.
    const r10 = result.proposals.find((proposal) => proposal.ruleId === 'R10')!;
    expect(r10.body).toMatch(/no match dollar amount is shown/i);
    expect(r10.dollarImpact).toBeNull();
    expect(result.evaluations.find((evaluation) => evaluation.ruleId === 'R11')?.eligible).toBe(false);
    expect(result.evaluations.find((evaluation) => evaluation.ruleId === 'R15')?.eligible).toBe(false);
    for (const proposal of result.proposals) {
      if (['R02', 'R16', 'R17', 'R24'].includes(proposal.ruleId)) {
        expect(proposal.body).not.toMatch(/premium of \$|payout of \$|guaranteed payout/i);
      }
    }
  });
});
