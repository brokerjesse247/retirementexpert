import { describe, expect, it } from 'vitest';
import { calculateAllocation, validateTargetEquityProfiles } from '../../lib/calculations/allocation';
import type { PlanningAssumptions, PlanningInput } from '../../lib/calculations/types';

const assumptions = {
  targetEquity: {
    CONSERVATIVE: 0.35,
    MODERATE: 0.55,
    AGGRESSIVE: 0.75,
  },
} as PlanningAssumptions;

function planningInput(overrides: Record<string, unknown> = {}): PlanningInput {
  return {
    riskProfile: 'MODERATE',
    persons: [{ name: 'Alex Client', ageMonths: 600, retirementAgeMonths: 780 }],
    accounts: [{ type: 'BROKERAGE', balance: 1_000_000 }],
    allocation: { stocks: 0.6, bonds: 0.3, cash: 0.1 },
    warnings: [],
    ...overrides,
  } as unknown as PlanningInput;
}

describe('allocation engine', () => {
  it('uses the editable profile setting, exposes capped horizon/coverage adjustments, and keeps the target at 100%', () => {
    const sourceInput = planningInput();
    const sourceAssumptions = structuredClone(assumptions);

    const result = calculateAllocation(sourceInput, sourceAssumptions, 1.25);

    expect(result.status).toBe('COMPLETE');
    expect(result.educational).toBe(true);
    expect(result.target).toMatchObject({
      profile: 'MODERATE',
      configuredEquity: 0.55,
      preGlideEquity: 0.6,
      currentEquity: 0.6,
      stocks: 0.6,
      bonds: 0.35,
      cash: 0.05,
      total: 1,
      adjustmentWasRangeClamped: true,
    });
    expect(result.target.adjustments).toEqual([
      expect.objectContaining({ rule: 'HORIZON', requested: 0.05, applied: 0.05 }),
      expect.objectContaining({ rule: 'INCOME_COVERAGE', requested: 0.025, applied: 0 }),
    ]);
    expect(sourceInput).toEqual(planningInput());
    expect(sourceAssumptions).toEqual(assumptions);
  });

  it('creates a five-year glide to the retirement floor and a cent-rounded zero-sum household illustration', () => {
    const input = planningInput({
      persons: [{ name: 'Alex Client', ageMonths: 720, retirementAgeMonths: 780 }],
      accounts: [
        { type: 'BROKERAGE', balance: 1_000_000 },
        { type: 'ANNUITY', balance: 125_000 },
      ],
    });

    const result = calculateAllocation(input, assumptions, 1);

    expect(result.glidePath).toMatchObject({
      startYearsBeforeRetirement: 10,
      intervalYears: 5,
      currentHorizonMonths: 60,
      currentHorizonYears: 5,
      retirementFloorEquity: 0.5,
    });
    expect(result.glidePath.rows.map((row) => [row.yearsToRetirement, row.equity, row.total]))
      .toEqual([[10, 0.55, 1], [5, 0.525, 1], [0, 0.5, 1]]);
    expect(result.target).toMatchObject({ stocks: 0.525, bonds: 0.425, cash: 0.05, total: 1 });
    expect(result.rebalancing).toMatchObject({
      householdEstimateOnly: true,
      eligibleHouseholdBalance: 1_000_000,
      excludedInsurancePolicyValue: 125_000,
      currentDollars: { stocks: 600_000, bonds: 300_000, cash: 100_000, total: 1_000_000 },
      targetDollars: { stocks: 525_000, bonds: 425_000, cash: 50_000, total: 1_000_000 },
      change: { stocks: -75_000, bonds: 125_000, cash: -50_000, total: 0 },
      netChange: 0,
    });
    expect(result.rebalancing!.change.stocks + result.rebalancing!.change.bonds + result.rebalancing!.change.cash).toBe(0);
    expect(result.assetLocation.educational).toBe(true);
    expect(result.assetLocation.tips).toHaveLength(3);
  });

  it('leaves current allocation and all dollar comparisons null when the household does not know its mix', () => {
    const result = calculateAllocation(planningInput({ allocation: null }), assumptions, null);

    expect(result.status).toBe('PARTIAL');
    expect(result.current).toBeNull();
    expect(result.rebalancing).toBeNull();
    expect(result.target).toMatchObject({ stocks: 0.6, bonds: 0.35, cash: 0.05, total: 1 });
    expect(result.warnings).toContain('Current household allocation is unknown; no current dollar allocation, rebalancing dollars, or trade-style comparison was created.');
    expect(result.warnings).toContain('Income coverage ratio is unavailable; the target does not apply an income-coverage adjustment.');
  });

  it('rejects a profile setting outside its approved editable range', () => {
    expect(() => validateTargetEquityProfiles({
      CONSERVATIVE: 0.45,
      MODERATE: 0.55,
      AGGRESSIVE: 0.75,
    })).toThrow('CONSERVATIVE target equity must be between 30% and 40%.');
  });
});
