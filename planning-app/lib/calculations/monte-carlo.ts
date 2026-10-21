import { clamp, roundMoney, uniqueWarnings } from './math';
import type { ModuleMeta, MonteCarloInput, PlanningAssumptions } from './types';

/** Contract defaults when no per-input or approved assumptions override is supplied. */
export const DEFAULT_MONTE_CARLO_RUNS = 5_000;
export const DEFAULT_MONTE_CARLO_SEED = 42;

const MAX_RUNS = 100_000;
const MAX_PROJECTION_YEARS = 120;
const MAX_MONEY = 1_000_000_000_000;
const UINT32_MAX = 0xffff_ffff;

export interface MonteCarloFanPoint {
  /** Projection-year ordinal, where 1 is the first annual cash-flow withdrawal. */
  year: number;
  /** Age in the projection year, or null when the caller did not supply startAge. */
  age: number | null;
  p10: number;
  median: number;
  p90: number;
}

export interface SequenceStressResult {
  /** -25% in the first projection year, followed by meanReturn in all later years. */
  firstYearReturn: number;
  subsequentYearReturn: number;
  endingBalance: number;
  /** True only when a requested withdrawal could not be paid in full. */
  ruined: boolean;
  /** Actual age of the first unpaid withdrawal, if startAge was supplied. */
  depletionAge: number | null;
  /** The unpaid portion of the first withdrawal that could not be funded. */
  firstShortfall: number;
}

export interface MonteCarloMethodology {
  returnDistribution: 'ARITHMETIC_NORMAL';
  negativeReturnFloor: number;
  portfolioOrder: 'WITHDRAW_THEN_RETURN';
  percentileMethod: 'LINEAR_INTERPOLATION';
}

export interface MonteCarloResult extends ModuleMeta {
  successPercent: number;
  medianEnding: number;
  p10Ending: number;
  p90Ending: number;
  fanChart: MonteCarloFanPoint[];
  /** Median first-unpaid-withdrawal age within the paths in the bottom terminal-value decile. */
  worstDecileDepletionAge: number | null;
  sequenceStress: SequenceStressResult;
  seed: number;
  runs: number;
  methodology: MonteCarloMethodology;
}

interface PathOutcome {
  endingBalance: number;
  yearlyBalances: number[];
  ruined: boolean;
  depletionYearIndex: number | null;
  firstShortfall: number;
  runIndex: number;
}

interface ResolvedInput {
  portfolio: number;
  annualWithdrawals: number[];
  meanReturn: number;
  volatility: number;
  runs: number;
  seed: number;
  startAge: number | undefined;
}

/**
 * Small, deterministic PRNG with no global state. A fresh generator is created
 * for every calculation, so a seed recreates all return paths exactly.
 */
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A cached Box-Muller standard-normal sampler backed by the supplied seeded PRNG. */
export function createBoxMullerSampler(random: () => number): () => number {
  let spare: number | null = null;

  return () => {
    if (spare !== null) {
      const result = spare;
      spare = null;
      return result;
    }

    // The PRNG is half-open [0, 1); replacing zero avoids log(0) for any valid caller.
    const u1 = Math.max(random(), Number.MIN_VALUE);
    const u2 = random();
    const magnitude = Math.sqrt(-2 * Math.log(u1));
    spare = magnitude * Math.sin(2 * Math.PI * u2);
    return magnitude * Math.cos(2 * Math.PI * u2);
  };
}

/**
 * Simulates the approved annual order: deduct the cash-flow withdrawal first,
 * then apply that year's return to the remaining portfolio.
 */
export function calculateMonteCarlo(input: MonteCarloInput, assumptions?: PlanningAssumptions): MonteCarloResult {
  const resolved = validateAndResolveInput(input, assumptions);
  const random = createSeededRng(resolved.seed);
  const standardNormal = createBoxMullerSampler(random);
  let clampedNegativeReturns = 0;

  const paths: PathOutcome[] = [];
  for (let runIndex = 0; runIndex < resolved.runs; runIndex += 1) {
    paths.push(simulatePath({
      portfolio: resolved.portfolio,
      annualWithdrawals: resolved.annualWithdrawals,
      startAge: resolved.startAge,
      runIndex,
      returnAtYear: () => {
        if (resolved.volatility === 0) return resolved.meanReturn;
        const sampledReturn = resolved.meanReturn + resolved.volatility * standardNormal();
        if (sampledReturn < -1) clampedNegativeReturns += 1;
        return clamp(sampledReturn, -1, Number.POSITIVE_INFINITY);
      },
    }));
  }

  const endings = paths.map((path) => path.endingBalance);
  const fanChart = resolved.annualWithdrawals.map((_, yearIndex) => {
    const balances = paths.map((path) => path.yearlyBalances[yearIndex]);
    return {
      year: yearIndex + 1,
      age: resolved.startAge === undefined ? null : resolved.startAge + yearIndex,
      p10: percentileMoney(balances, 0.1),
      median: percentileMoney(balances, 0.5),
      p90: percentileMoney(balances, 0.9),
    };
  });

  const successfulRuns = paths.filter((path) => !path.ruined).length;
  const worstDecileDepletionAge = calculateWorstDecileDepletionAge(paths, resolved.startAge);
  const sequenceStressPath = simulatePath({
    portfolio: resolved.portfolio,
    annualWithdrawals: resolved.annualWithdrawals,
    startAge: resolved.startAge,
    runIndex: 0,
    returnAtYear: (yearIndex) => (yearIndex === 0 ? -0.25 : resolved.meanReturn),
  });

  const warnings: string[] = [];
  if (clampedNegativeReturns > 0) {
    warnings.push(`${clampedNegativeReturns} sampled arithmetic-normal return${clampedNegativeReturns === 1 ? '' : 's'} below -100% ${clampedNegativeReturns === 1 ? 'was' : 'were'} clamped to -100%.`);
  }
  if (worstDecileDepletionAge === null && paths.some((path) => path.ruined) && resolved.startAge === undefined) {
    warnings.push('Worst-decile depletion age is unavailable because startAge was not supplied.');
  }

  return {
    status: 'COMPLETE',
    warnings: uniqueWarnings(warnings),
    // This engine uses caller-supplied planning assumptions; it embeds no annual official figures.
    sources: [],
    successPercent: roundMoney((successfulRuns / resolved.runs) * 100),
    medianEnding: percentileMoney(endings, 0.5),
    p10Ending: percentileMoney(endings, 0.1),
    p90Ending: percentileMoney(endings, 0.9),
    fanChart,
    worstDecileDepletionAge,
    sequenceStress: {
      firstYearReturn: -0.25,
      subsequentYearReturn: resolved.meanReturn,
      endingBalance: sequenceStressPath.endingBalance,
      ruined: sequenceStressPath.ruined,
      depletionAge: depletionAge(sequenceStressPath.depletionYearIndex, resolved.startAge),
      firstShortfall: sequenceStressPath.firstShortfall,
    },
    seed: resolved.seed,
    runs: resolved.runs,
    methodology: {
      returnDistribution: 'ARITHMETIC_NORMAL',
      negativeReturnFloor: -1,
      portfolioOrder: 'WITHDRAW_THEN_RETURN',
      percentileMethod: 'LINEAR_INTERPOLATION',
    },
  };
}

function validateAndResolveInput(input: MonteCarloInput, assumptions?: PlanningAssumptions): ResolvedInput {
  if (!input || typeof input !== 'object') throw new TypeError('Monte Carlo input is required.');

  const portfolio = validateMoney(input.portfolio, 'portfolio');
  if (!Array.isArray(input.annualWithdrawals) || input.annualWithdrawals.length === 0) {
    throw new RangeError('annualWithdrawals must contain at least one annual cash-flow withdrawal.');
  }
  if (input.annualWithdrawals.length > MAX_PROJECTION_YEARS) {
    throw new RangeError(`annualWithdrawals cannot exceed ${MAX_PROJECTION_YEARS} projection years.`);
  }
  const annualWithdrawals = input.annualWithdrawals.map((withdrawal, index) => validateMoney(withdrawal, `annualWithdrawals[${index}]`));

  validateFiniteRate(input.meanReturn, 'meanReturn', -1, 1);
  validateFiniteRate(input.volatility, 'volatility', 0, 1);

  const runs = input.runs ?? assumptions?.monteCarloRuns ?? DEFAULT_MONTE_CARLO_RUNS;
  if (!Number.isSafeInteger(runs) || runs < 1 || runs > MAX_RUNS) {
    throw new RangeError(`runs must be a whole number from 1 to ${MAX_RUNS}.`);
  }

  const seed = input.seed ?? assumptions?.monteCarloSeed ?? DEFAULT_MONTE_CARLO_SEED;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > UINT32_MAX) {
    throw new RangeError(`seed must be an integer from 0 to ${UINT32_MAX}.`);
  }

  if (input.startAge !== undefined && (!Number.isInteger(input.startAge) || input.startAge < 0 || input.startAge > 120)) {
    throw new RangeError('startAge must be a whole age from 0 through 120 when provided.');
  }

  return {
    portfolio,
    annualWithdrawals,
    meanReturn: input.meanReturn,
    volatility: input.volatility,
    runs,
    seed,
    startAge: input.startAge,
  };
}

function validateMoney(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > MAX_MONEY) {
    throw new RangeError(`${name} must be a finite dollar amount from 0 to ${MAX_MONEY}.`);
  }
  return roundMoney(value);
}

function validateFiniteRate(value: number, name: string, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be a finite fraction from ${min} through ${max}.`);
  }
}

function simulatePath(args: {
  portfolio: number;
  annualWithdrawals: number[];
  startAge: number | undefined;
  runIndex: number;
  returnAtYear: (yearIndex: number) => number;
}): PathOutcome {
  let balance = args.portfolio;
  let ruined = false;
  let depletionYearIndex: number | null = null;
  let firstShortfall = 0;
  const yearlyBalances: number[] = [];

  for (let yearIndex = 0; yearIndex < args.annualWithdrawals.length; yearIndex += 1) {
    // Deliberately consume every annual return even after a ruin, keeping every path's RNG draw count fixed.
    const annualReturn = args.returnAtYear(yearIndex);
    const withdrawal = args.annualWithdrawals[yearIndex];

    if (!ruined) {
      if (balance < withdrawal) {
        ruined = true;
        depletionYearIndex = yearIndex;
        firstShortfall = roundMoney(withdrawal - balance);
        balance = 0;
      } else {
        const afterWithdrawal = roundMoney(balance - withdrawal);
        balance = roundSimulationBalance(afterWithdrawal * (1 + annualReturn));
      }
    }

    yearlyBalances.push(balance);
  }

  return {
    endingBalance: balance,
    yearlyBalances,
    ruined,
    depletionYearIndex,
    firstShortfall,
    runIndex: args.runIndex,
  };
}

function roundSimulationBalance(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 10_000_000_000_000) {
    throw new RangeError('Simulated balance outside supported calculation range.');
  }
  return roundMoney(value);
}

function percentileMoney(values: number[], percentile: number): number {
  if (values.length === 0) throw new RangeError('Cannot calculate a percentile of an empty series.');
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const weight = position - lowerIndex;
  return roundMoney(sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * weight);
}

function calculateWorstDecileDepletionAge(paths: PathOutcome[], startAge: number | undefined): number | null {
  if (startAge === undefined) return null;

  const bottomCount = Math.max(1, Math.ceil(paths.length * 0.1));
  const worstPaths = [...paths]
    .sort((left, right) => left.endingBalance - right.endingBalance || left.runIndex - right.runIndex)
    .slice(0, bottomCount);
  const depletionYears = worstPaths
    .map((path) => path.depletionYearIndex)
    .filter((yearIndex): yearIndex is number => yearIndex !== null)
    .sort((left, right) => left - right);

  if (depletionYears.length === 0) return null;
  // Lower median retains an actual annual age rather than manufacturing a fractional age.
  return startAge + depletionYears[Math.floor((depletionYears.length - 1) / 2)];
}

function depletionAge(depletionYearIndex: number | null, startAge: number | undefined): number | null {
  if (depletionYearIndex === null || startAge === undefined) return null;
  return startAge + depletionYearIndex;
}
