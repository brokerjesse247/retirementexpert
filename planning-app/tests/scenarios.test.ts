import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS } from '../lib/assumptions/defaults';
import { mapPlanningInput, mapScenarioPlanningInput, scenarioOverridesSchema } from '../lib/calculations/input';
import { simulationInput } from '../lib/calculations/engine';
import { calculateCashFlow } from '../lib/calculations/cash-flow';
import { calculateMonteCarlo } from '../lib/calculations/monte-carlo';
import { parseScenarioPayload, serializeScenarioPayload } from '../lib/scenarios/service';
import { jamesLindaMitchellFixture, SECTION_14_SAMPLE_AS_OF_DATE } from './fixtures/section-14-sample-households';

function assumptions() {
  return { ...structuredClone(DEFAULT_ASSUMPTIONS), monteCarloRuns: 40, monteCarloSeed: 8675309 };
}

describe('saved planning scenarios', () => {
  it('is deterministic and does not mutate Base input or assumptions', () => {
    const baseAssumptions = assumptions();
    const base = mapPlanningInput(jamesLindaMitchellFixture.raw, baseAssumptions, SECTION_14_SAMPLE_AS_OF_DATE);
    const originalInput = structuredClone(base);
    const originalAssumptions = structuredClone(baseAssumptions);
    const overrides = scenarioOverridesSchema.parse({
      people: { PRIMARY: { retirementAge: 65, socialSecurityClaimAge: 67 } },
      spending: { retirementMonthly: 6000 },
      returns: { annualRate: 0.04 },
      inflation: { annualRate: 0.025 },
    });
    const effective = mapScenarioPlanningInput(jamesLindaMitchellFixture.raw, baseAssumptions, SECTION_14_SAMPLE_AS_OF_DATE, overrides);
    const monteCarloInput = { portfolio: 1_000_000, annualWithdrawals: [40_000, 42_000, 44_000], meanReturn: effective.assumptions.returnByRisk[effective.input.riskProfile], volatility: 0.12, runs: 40, seed: 8675309 };
    const first = calculateMonteCarlo(monteCarloInput, effective.assumptions);
    const second = calculateMonteCarlo(monteCarloInput, effective.assumptions);

    expect(base).toEqual(originalInput);
    expect(baseAssumptions).toEqual(originalAssumptions);
    expect(first).toEqual(second);
  });

  it('rejects unknown nested fields instead of ignoring them', () => {
    expect(scenarioOverridesSchema.safeParse({ spending: { retirementMonthly: 6000, madeUpField: 1 } }).success).toBe(false);
    expect(scenarioOverridesSchema.safeParse({ people: { PRIMARY: { socialSecurityClaimAge: 67, benefitAdjustment: 1 } } }).success).toBe(false);
  });

  it('preserves direct source lineage in encrypted-payload content', () => {
    const payload = serializeScenarioPayload({ spending: { retirementMonthly: 6000 } }, { sourceScenarioId: 'scenario-source', sourceScenarioRevision: 4 });
    expect(parseScenarioPayload(payload)).toEqual(payload);
  });

  it('routes saved Roth schedules, LTC events, and hypothetical annuities into actual cash flow and Monte Carlo inputs', () => {
    const raw = structuredClone(jamesLindaMitchellFixture.raw);
    // This is a test-only synthetic balance that keeps both projections solvent so the MC input difference is observable.
    raw.primary.preTax401k = '3000000';
    raw.expenses.retirementMonthly = '3000';
    const baseAssumptions = assumptions();
    const baseInput = mapPlanningInput(raw, baseAssumptions, SECTION_14_SAMPLE_AS_OF_DATE, { primaryPlanningAge: 80, spousePlanningAge: 80 });
    const baselineFlow = calculateCashFlow(baseInput, baseAssumptions);
    const overrides = scenarioOverridesSchema.parse({
      general: { primaryPlanningAge: 80, spousePlanningAge: 80 },
      rothSchedule: { '2028': 20_000 },
      ltcEvent: { person: 'PRIMARY', startAge: 70, durationYears: 2, monthlyCost: 8_000 },
      annuityPurchase: {
        owner: 'PRIMARY', fundingAccount: { owner: 'PRIMARY', type: 'TRAD_IRA' },
        premium: 20_000, monthlyIncome: 600, startAge: 63, taxQualification: 'QUALIFIED',
      },
    });
    const effective = mapScenarioPlanningInput(raw, baseAssumptions, SECTION_14_SAMPLE_AS_OF_DATE, overrides);
    const scenarioFlow = calculateCashFlow(effective.input, effective.assumptions, effective.engineOptions.cashFlow);
    const rothRow = scenarioFlow.rows.find((row) => row.year === 2028);
    const ltcYear = 1967 + 70;
    const ltcRow = scenarioFlow.rows.find((row) => row.year === ltcYear);
    const baseLtcRow = baselineFlow.rows.find((row) => row.year === ltcYear);
    const annuityRow = scenarioFlow.rows.find((row) => row.year === 2030);
    const baselineMcInput = simulationInput(baseInput, baseAssumptions, baselineFlow);
    const scenarioMcInput = simulationInput(effective.input, effective.assumptions, scenarioFlow, effective.engineOptions.monteCarloMeanReturn);
    const baselineMonteCarlo = calculateMonteCarlo(baselineMcInput, baseAssumptions);
    const scenarioMonteCarlo = calculateMonteCarlo(scenarioMcInput, effective.assumptions);

    expect(rothRow?.rothConversion).toBe(20_000);
    expect(ltcRow?.goals).toBeGreaterThan(baseLtcRow?.goals ?? 0);
    expect(annuityRow?.annuity).toBeGreaterThan(0);
    expect(effective.input.accounts.find((account) => account.owner === 'PRIMARY' && account.type === 'TRAD_IRA')?.balance).toBe(70_000);
    expect(scenarioMcInput.annualWithdrawals).not.toEqual(baselineMcInput.annualWithdrawals);
    expect(scenarioMonteCarlo.medianEnding).not.toBe(baselineMonteCarlo.medianEnding);
  });

  it('rejects Social Security claim changes for an already receiving person', () => {
    const raw = structuredClone(jamesLindaMitchellFixture.raw);
    raw.primary.receivingSocialSecurity = 'YES';
    raw.primary.socialSecurityMonthly = '2500';
    raw.primary.socialSecurityStartAge = '62';
    const overrides = scenarioOverridesSchema.parse({ people: { PRIMARY: { socialSecurityClaimAge: 70 } } });
    expect(() => mapScenarioPlanningInput(raw, assumptions(), SECTION_14_SAMPLE_AS_OF_DATE, overrides)).toThrow(/already receiving Social Security/i);
  });
});
