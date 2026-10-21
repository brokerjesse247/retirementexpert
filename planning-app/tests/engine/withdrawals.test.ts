import { describe, expect, it, vi } from 'vitest';
import type { MonteCarloInput, PlanningAssumptions } from '../../lib/calculations/types';

const { mockedCalculateMonteCarlo } = vi.hoisted(() => ({
  mockedCalculateMonteCarlo: vi.fn(),
}));

vi.mock('../../lib/calculations/monte-carlo', () => ({
  calculateMonteCarlo: mockedCalculateMonteCarlo,
}));

import {
  buildBuckets,
  buildGuardrailSchedule,
  calculateWithdrawalStrategies,
  fourPercentRule,
} from '../../lib/calculations/withdrawals';

const assumptions = {
  inflation: 0.025,
  monteCarloTarget: 85,
  monteCarloSeed: 42,
  sources: [],
  annual: { sources: [] },
} as unknown as PlanningAssumptions;

function input(overrides: Partial<MonteCarloInput> = {}): MonteCarloInput {
  return {
    portfolio: 1_000_000,
    annualWithdrawals: Array.from({ length: 10 }, (_, index) => 40_000 + index * 1_000),
    meanReturn: 0.065,
    volatility: 0.11,
    runs: 25,
    seed: 42,
    ...overrides,
  };
}

describe('withdrawals engine', () => {
  it('applies the required 4% rule with cent rounding', () => {
    expect(fourPercentRule(1_000_000)).toBe(40_000);
    expect(fourPercentRule(123_456.789)).toBe(4_938.27);
  });

  it('finds the highest sustainable first-year amount using fixed-seed 5,000-run trials and preserves the supplied schedule shape', () => {
    mockedCalculateMonteCarlo.mockImplementation((simulation: MonteCarloInput) => ({
      status: 'COMPLETE',
      warnings: [],
      sources: [],
      successPercent: simulation.annualWithdrawals[0] <= 50_000 ? 85 : 84,
    }));
    const base = input();
    const originalSchedule = [...base.annualWithdrawals];

    const result = calculateWithdrawalStrategies(base, assumptions);

    expect(result.sustainableAnnual).toBe(50_000);
    expect(result.sustainableRate).toBe(0.05);
    expect(result.method.sustainableRate.annualSchedule.slice(0, 2)).toEqual([50_000, 51_250]);
    expect(result.method.sustainableRate.simulationRuns).toBe(5_000);
    expect(result.method.sustainableRate.seed).toBe(42);
    expect(result.method.sustainableRate.achievedSuccessPercent).toBe(85);
    expect(base.annualWithdrawals).toEqual(originalSchedule);
    expect(mockedCalculateMonteCarlo.mock.calls.length).toBeGreaterThan(1);
    for (const [trial] of mockedCalculateMonteCarlo.mock.calls as Array<[MonteCarloInput, PlanningAssumptions]>) {
      expect(trial.runs).toBe(5_000);
      expect(trial.seed).toBe(42);
    }
  });

  it('uses 20% draw-rate bands and 10% spending adjustments without implying an unfunded withdrawal is paid', () => {
    const rows = buildGuardrailSchedule({
      portfolio: 1_000_000,
      initialAnnual: 40_000,
      years: 2,
      inflation: 0,
      expectedReturn: -0.5,
    });

    expect(rows[0]).toMatchObject({ action: 'INITIAL', endingBalance: 480_000 });
    expect(rows[1]).toMatchObject({ action: 'CUT_10_PERCENT', requestedWithdrawal: 36_000, fundedWithdrawal: 36_000, unfundedWithdrawal: 0 });
  });

  it('clips cash and bond buckets to actual assets and flags the shortfall rather than fabricating enough assets', () => {
    const buckets = buildBuckets(100_000, Array.from({ length: 10 }, () => 60_000));

    expect(buckets.cash).toMatchObject({ requested: 120_000, amount: 100_000, unfunded: 20_000 });
    expect(buckets.bonds).toMatchObject({ requested: 480_000, amount: 0, unfunded: 480_000 });
    expect(buckets.growth.amount).toBe(0);
    expect(buckets.nearTermShortfall).toBe(500_000);
    expect(buckets.insufficientFunds).toBe(true);
    expect(buckets.cash.amount + buckets.bonds.amount + buckets.growth.amount).toBe(100_000);
  });
});
