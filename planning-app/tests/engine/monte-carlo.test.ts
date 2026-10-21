import { describe, expect, it } from 'vitest';
import { calculateMonteCarlo, DEFAULT_MONTE_CARLO_RUNS, DEFAULT_MONTE_CARLO_SEED } from '@/lib/calculations/monte-carlo';

describe('calculateMonteCarlo', () => {
  const thirtyYearsOfFortyThousand = Array.from({ length: 30 }, () => 40_000);

  it('uses the documented 5,000-run seed-42 defaults and repeats an identical seeded result exactly', () => {
    const input = {
      portfolio: 2_000_000,
      annualWithdrawals: thirtyYearsOfFortyThousand,
      meanReturn: 0.065,
      volatility: 0.11,
      startAge: 65,
    };

    const first = calculateMonteCarlo(input);
    const second = calculateMonteCarlo(input);

    expect(first).toEqual(second);
    expect(first.runs).toBe(DEFAULT_MONTE_CARLO_RUNS);
    expect(first.seed).toBe(DEFAULT_MONTE_CARLO_SEED);
    expect(first.successPercent).toBeGreaterThan(90);
    expect(first.fanChart).toHaveLength(30);
    expect(first.fanChart[0]).toMatchObject({ year: 1, age: 65 });
  });

  it('meets the low-portfolio sanity case and includes zero-value ruins in ending percentiles', () => {
    const result = calculateMonteCarlo({
      portfolio: 300_000,
      annualWithdrawals: Array.from({ length: 30 }, () => 60_000),
      meanReturn: 0.065,
      volatility: 0.11,
      runs: 5_000,
      seed: 42,
      startAge: 65,
    });

    expect(result.successPercent).toBeLessThan(10);
    expect(result.p10Ending).toBe(0);
    expect(result.worstDecileDepletionAge).not.toBeNull();
  });

  it('deducts the scheduled withdrawal before applying a return and permits an exact final withdrawal', () => {
    const ordered = calculateMonteCarlo({
      portfolio: 100,
      annualWithdrawals: [50],
      meanReturn: 1,
      volatility: 0,
      runs: 1,
      seed: 1,
      startAge: 65,
    });
    const exactFinalWithdrawal = calculateMonteCarlo({
      portfolio: 100,
      annualWithdrawals: [100],
      meanReturn: 0,
      volatility: 0,
      runs: 1,
      seed: 1,
      startAge: 65,
    });

    // (100 - 50) * (1 + 100%) = 100; return-then-withdraw would have yielded 150.
    expect(ordered.medianEnding).toBe(100);
    expect(exactFinalWithdrawal.successPercent).toBe(100);
    expect(exactFinalWithdrawal.medianEnding).toBe(0);
    expect(exactFinalWithdrawal.sequenceStress.ruined).toBe(false);
  });

  it('uses the required sequence stress of -25% in year one then the supplied mean return', () => {
    const result = calculateMonteCarlo({
      portfolio: 100,
      annualWithdrawals: [0, 0],
      meanReturn: 0.1,
      volatility: 0,
      runs: 1,
      seed: 42,
      startAge: 65,
    });

    expect(result.sequenceStress).toMatchObject({
      firstYearReturn: -0.25,
      subsequentYearReturn: 0.1,
      endingBalance: 82.5,
      ruined: false,
    });
  });

  it('clamps impossible below-negative-100-percent normal draws and discloses the clamp', () => {
    const result = calculateMonteCarlo({
      portfolio: 100,
      annualWithdrawals: [0],
      meanReturn: -1,
      volatility: 1,
      runs: 100,
      seed: 42,
    });

    expect(result.warnings.some((warning) => warning.includes('clamped to -100%'))).toBe(true);
    expect(result.methodology.negativeReturnFloor).toBe(-1);
  });

  it('rejects invalid bounds rather than fabricating a probability', () => {
    const validInput = {
      portfolio: 100_000,
      annualWithdrawals: [10_000],
      meanReturn: 0.05,
      volatility: 0.1,
    };

    expect(() => calculateMonteCarlo({ ...validInput, runs: 0 })).toThrow(/runs/);
    expect(() => calculateMonteCarlo({ ...validInput, seed: -1 })).toThrow(/seed/);
    expect(() => calculateMonteCarlo({ ...validInput, volatility: 1.01 })).toThrow(/volatility/);
    expect(() => calculateMonteCarlo({ ...validInput, annualWithdrawals: [-1] })).toThrow(/annualWithdrawals/);
    expect(() => calculateMonteCarlo({ ...validInput, annualWithdrawals: [] })).toThrow(/annualWithdrawals/);
  });
});
