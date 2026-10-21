import { roundMoney, uniqueWarnings } from './math';
import { calculateMonteCarlo } from './monte-carlo';
import type { ModuleMeta, MonteCarloInput, PlanningAssumptions } from './types';

const FOUR_PERCENT_RATE = 0.04;
const GUARDRAIL_BAND = 0.2;
const GUARDRAIL_SPENDING_ADJUSTMENT = 0.1;
const SUSTAINABLE_RUNS = 5_000;
const SEARCH_TOLERANCE_DOLLARS = 0.01;
const MAX_SEARCH_ITERATIONS = 60;

export type GuardrailAction = 'INITIAL' | 'INFLATION' | 'CUT_10_PERCENT' | 'RAISE_10_PERCENT' | 'DEPLETED';

export interface GuardrailYear {
  year: number;
  beginningBalance: number;
  requestedWithdrawal: number;
  fundedWithdrawal: number;
  unfundedWithdrawal: number;
  withdrawalRate: number | null;
  action: GuardrailAction;
  endingBalance: number;
}

export interface Guardrails {
  initialAnnual: number;
  initialRate: number;
  lowerRate: number;
  upperRate: number;
  spendingAdjustment: number;
  annualSchedule: GuardrailYear[];
  educational: true;
}

export interface BucketAllocation {
  targetYears: number[];
  modeledYears: number[];
  requested: number;
  amount: number;
  unfunded: number;
}

export interface Buckets {
  cash: BucketAllocation;
  bonds: BucketAllocation;
  growth: { amount: number };
  requiredNearTerm: number;
  fundedNearTerm: number;
  nearTermShortfall: number;
  insufficientFunds: boolean;
  scheduleCompleteThroughYear10: boolean;
}

export interface WithdrawalMethod {
  annualWithdrawalBase: number[];
  fourPercent: {
    inflationRate: number;
    annualSchedule: number[];
    assumptions: string[];
    limitations: string[];
  };
  sustainableRate: {
    model: 'BOUNDED_BINARY_SEARCH';
    targetSuccessPercent: number;
    simulationRuns: number;
    seed: number;
    toleranceDollars: number;
    maxIterations: number;
    iterations: number;
    achievedSuccessPercent: number | null;
    annualSchedule: number[];
    assumptions: string[];
    limitations: string[];
  };
  guardrails: {
    expectedReturn: number;
    assumptions: string[];
    limitations: string[];
  };
  buckets: {
    assumptions: string[];
    limitations: string[];
  };
}

export interface WithdrawalStrategiesResult extends ModuleMeta {
  fourPercentAnnual: number;
  sustainableRate: number | null;
  sustainableAnnual: number;
  guardrails: Guardrails;
  buckets: Buckets;
  method: WithdrawalMethod;
}

function assertFiniteNonNegative(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a finite non-negative dollar amount.`);
  // Reuse the shared upper-bound and half-up money validation.
  roundMoney(value);
}

function validateWithdrawalInputs(input: MonteCarloInput, assumptions: PlanningAssumptions): void {
  assertFiniteNonNegative(input.portfolio, 'Portfolio');
  if (!Array.isArray(input.annualWithdrawals) || input.annualWithdrawals.length === 0) {
    throw new Error('An annual withdrawal schedule is required to calculate withdrawal strategies.');
  }
  input.annualWithdrawals.forEach((amount, index) => assertFiniteNonNegative(amount, `Annual withdrawal ${index + 1}`));
  if (input.annualWithdrawals[0] <= 0) {
    throw new Error('The first annual withdrawal must be greater than zero to calculate an initial withdrawal rate.');
  }
  if (!Number.isFinite(input.meanReturn) || input.meanReturn <= -1) {
    throw new Error('Mean return must be finite and greater than -100%.');
  }
  if (!Number.isFinite(assumptions.inflation) || assumptions.inflation <= -1) {
    throw new Error('Inflation must be finite and greater than -100%.');
  }
  if (!Number.isFinite(assumptions.monteCarloTarget) || assumptions.monteCarloTarget < 0 || assumptions.monteCarloTarget > 100) {
    throw new Error('Monte Carlo target must be expressed as a percentage from 0 to 100.');
  }
  const seed = input.seed ?? assumptions.monteCarloSeed;
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error('Monte Carlo seed must be an integer from 0 through 4294967295.');
  }
}

function sumMoney(values: readonly number[]): number {
  return roundMoney(values.reduce((sum, value) => sum + value, 0));
}

function range(from: number, toInclusive: number): number[] {
  return Array.from({ length: Math.max(0, toInclusive - from + 1) }, (_, offset) => from + offset);
}

/** Four percent of the retirement portfolio, rounded at the dollar-output boundary. */
export function fourPercentRule(portfolio: number): number {
  assertFiniteNonNegative(portfolio, 'Portfolio');
  return roundMoney(portfolio * FOUR_PERCENT_RATE);
}

/**
 * Creates a transparent, deterministic illustration of Guyton-style spending
 * guardrails. It is not a tax-aware withdrawal order or a market forecast.
 */
export function buildGuardrailSchedule(args: {
  portfolio: number;
  initialAnnual: number;
  years: number;
  inflation: number;
  expectedReturn: number;
}): GuardrailYear[] {
  const { portfolio, initialAnnual, years, inflation, expectedReturn } = args;
  assertFiniteNonNegative(portfolio, 'Portfolio');
  assertFiniteNonNegative(initialAnnual, 'Initial annual withdrawal');
  if (!Number.isInteger(years) || years < 0) throw new Error('Guardrail years must be a non-negative integer.');
  if (!Number.isFinite(inflation) || inflation <= -1) throw new Error('Inflation must be finite and greater than -100%.');
  if (!Number.isFinite(expectedReturn) || expectedReturn <= -1) throw new Error('Expected return must be finite and greater than -100%.');

  const lowerRate = FOUR_PERCENT_RATE * (1 - GUARDRAIL_BAND);
  const upperRate = FOUR_PERCENT_RATE * (1 + GUARDRAIL_BAND);
  let balance = roundMoney(portfolio);
  let requested = roundMoney(initialAnnual);
  const rows: GuardrailYear[] = [];

  for (let index = 0; index < years; index += 1) {
    if (index > 0) requested = roundMoney(requested * (1 + inflation));
    const beginningBalance = balance;
    let action: GuardrailAction = index === 0 ? 'INITIAL' : 'INFLATION';
    const preAdjustmentRate = beginningBalance > 0 ? requested / beginningBalance : null;

    if (preAdjustmentRate === null) {
      action = 'DEPLETED';
    } else if (preAdjustmentRate > upperRate) {
      requested = roundMoney(requested * (1 - GUARDRAIL_SPENDING_ADJUSTMENT));
      action = 'CUT_10_PERCENT';
    } else if (preAdjustmentRate < lowerRate) {
      requested = roundMoney(requested * (1 + GUARDRAIL_SPENDING_ADJUSTMENT));
      action = 'RAISE_10_PERCENT';
    }

    const fundedWithdrawal = roundMoney(Math.min(beginningBalance, requested));
    const unfundedWithdrawal = roundMoney(Math.max(0, requested - fundedWithdrawal));
    balance = roundMoney(Math.max(0, (beginningBalance - fundedWithdrawal) * (1 + expectedReturn)));

    rows.push({
      year: index + 1,
      beginningBalance,
      requestedWithdrawal: requested,
      fundedWithdrawal,
      unfundedWithdrawal,
      withdrawalRate: beginningBalance > 0 ? requested / beginningBalance : null,
      action,
      endingBalance: balance,
    });
  }

  return rows;
}

/** Allocates only actual portfolio dollars to a two-year cash / next-eight-year bond bucket plan. */
export function buildBuckets(portfolio: number, annualWithdrawals: readonly number[]): Buckets {
  assertFiniteNonNegative(portfolio, 'Portfolio');
  if (annualWithdrawals.length === 0) throw new Error('An annual withdrawal schedule is required for bucket allocation.');
  annualWithdrawals.forEach((amount, index) => assertFiniteNonNegative(amount, `Annual withdrawal ${index + 1}`));

  const capital = roundMoney(portfolio);
  const cashTargetYears = [1, 2];
  const bondTargetYears = range(3, 10);
  const cashModeledYears = range(1, Math.min(2, annualWithdrawals.length));
  const bondsModeledYears = annualWithdrawals.length > 2 ? range(3, Math.min(10, annualWithdrawals.length)) : [];
  const cashRequested = sumMoney(annualWithdrawals.slice(0, 2));
  const bondsRequested = sumMoney(annualWithdrawals.slice(2, 10));

  const cashAmount = roundMoney(Math.min(capital, cashRequested));
  const afterCash = roundMoney(capital - cashAmount);
  const bondsAmount = roundMoney(Math.min(afterCash, bondsRequested));
  const growthAmount = roundMoney(afterCash - bondsAmount);
  const cashUnfunded = roundMoney(cashRequested - cashAmount);
  const bondsUnfunded = roundMoney(bondsRequested - bondsAmount);
  const requiredNearTerm = roundMoney(cashRequested + bondsRequested);
  const fundedNearTerm = roundMoney(cashAmount + bondsAmount);
  const nearTermShortfall = roundMoney(cashUnfunded + bondsUnfunded);

  return {
    cash: { targetYears: cashTargetYears, modeledYears: cashModeledYears, requested: cashRequested, amount: cashAmount, unfunded: cashUnfunded },
    bonds: { targetYears: bondTargetYears, modeledYears: bondsModeledYears, requested: bondsRequested, amount: bondsAmount, unfunded: bondsUnfunded },
    growth: { amount: growthAmount },
    requiredNearTerm,
    fundedNearTerm,
    nearTermShortfall,
    insufficientFunds: nearTermShortfall > 0,
    scheduleCompleteThroughYear10: annualWithdrawals.length >= 10,
  };
}

function inflationSchedule(initialAnnual: number, years: number, inflation: number): number[] {
  return Array.from({ length: years }, (_, index) => roundMoney(initialAnnual * Math.pow(1 + inflation, index)));
}

function scaleSchedule(base: readonly number[], baseInitial: number, initialAnnual: number): number[] {
  const multiplier = initialAnnual / baseInitial;
  return base.map((withdrawal) => roundMoney(withdrawal * multiplier));
}

function sourceUrls(assumptions: PlanningAssumptions): string[] {
  return [...new Set([...assumptions.sources, ...assumptions.annual.sources].map((source) => source.url).filter(Boolean))];
}

/**
 * Compares withdrawal illustrations against the supplied cash-flow withdrawal
 * schedule. The sustainable amount is the highest first-year amount found by a
 * cent-bounded search whose fixed-seed 5,000-run Monte Carlo success rate meets
 * the configured target.
 */
export function calculateWithdrawalStrategies(input: MonteCarloInput, assumptions: PlanningAssumptions): WithdrawalStrategiesResult {
  validateWithdrawalInputs(input, assumptions);
  const portfolio = roundMoney(input.portfolio);
  const annualWithdrawalBase = input.annualWithdrawals.map((withdrawal) => roundMoney(withdrawal));
  const seed = input.seed ?? assumptions.monteCarloSeed;
  const targetSuccessPercent = assumptions.monteCarloTarget;
  const fourPercentAnnual = fourPercentRule(portfolio);
  const fourPercentSchedule = inflationSchedule(fourPercentAnnual, annualWithdrawalBase.length, assumptions.inflation);
  const buckets = buildBuckets(portfolio, annualWithdrawalBase);
  const guardrailSchedule = buildGuardrailSchedule({
    portfolio,
    initialAnnual: fourPercentAnnual,
    years: annualWithdrawalBase.length,
    inflation: assumptions.inflation,
    expectedReturn: input.meanReturn,
  });

  let sustainableAnnual = 0;
  let sustainableRate: number | null = portfolio > 0 ? 0 : null;
  let iterations = 0;
  let achievedSuccessPercent: number | null = null;
  let sustainableSchedule = scaleSchedule(annualWithdrawalBase, annualWithdrawalBase[0], 0);
  let finalSimulation: ReturnType<typeof calculateMonteCarlo> | null = null;

  if (portfolio > 0) {
    const runTrial = (initialAnnual: number): ReturnType<typeof calculateMonteCarlo> => calculateMonteCarlo({
      ...input,
      annualWithdrawals: scaleSchedule(annualWithdrawalBase, annualWithdrawalBase[0], initialAnnual),
      runs: SUSTAINABLE_RUNS,
      seed,
    }, assumptions);

    // Establishes a deterministic feasible lower bound using the same seed and run count as every search trial.
    const zeroTrial = runTrial(0);
    finalSimulation = zeroTrial;
    achievedSuccessPercent = zeroTrial.successPercent;

    if (zeroTrial.successPercent >= targetSuccessPercent) {
      let low = 0;
      let high = portfolio;
      let bestSimulation = zeroTrial;

      while (high - low > SEARCH_TOLERANCE_DOLLARS && iterations < MAX_SEARCH_ITERATIONS) {
        const candidate = roundMoney((low + high) / 2);
        if (candidate <= low || candidate >= high) break;
        const trial = runTrial(candidate);
        iterations += 1;

        if (trial.successPercent >= targetSuccessPercent) {
          low = candidate;
          bestSimulation = trial;
        } else {
          high = candidate;
        }
      }

      sustainableAnnual = roundMoney(low);
      sustainableRate = sustainableAnnual / portfolio;
      sustainableSchedule = scaleSchedule(annualWithdrawalBase, annualWithdrawalBase[0], sustainableAnnual);
      finalSimulation = bestSimulation;
      achievedSuccessPercent = bestSimulation.successPercent;
    }
  }

  const warnings = [
    ...(finalSimulation?.warnings ?? []),
    'Withdrawal strategies are educational illustrations and are not tax-aware withdrawal optimization or personalized investment advice.',
    'The sustainable-rate search reuses the supplied annual cash-flow withdrawal schedule; it does not create tax, RMD, income, healthcare, or spending projections.',
  ];
  if (portfolio === 0) warnings.push('No portfolio is available; a sustainable withdrawal rate cannot be calculated.');
  if (!buckets.scheduleCompleteThroughYear10) warnings.push('The supplied annual withdrawal schedule is shorter than 10 years, so the bond bucket is limited to supplied years and does not demonstrate a complete years-3-through-10 reserve.');
  if (buckets.insufficientFunds) warnings.push(`Portfolio assets are insufficient to fund the modeled cash and bond buckets by $${buckets.nearTermShortfall.toFixed(2)}; no additional assets were assumed.`);
  if (input.runs !== undefined && input.runs !== SUSTAINABLE_RUNS) warnings.push(`The sustainable-rate search uses the required ${SUSTAINABLE_RUNS.toLocaleString('en-US')}-run Monte Carlo basis rather than input.runs=${input.runs}.`);

  const simulationStatus = finalSimulation?.status;
  const status: ModuleMeta['status'] = portfolio === 0 || !buckets.scheduleCompleteThroughYear10 || simulationStatus === 'PARTIAL' || simulationStatus === 'UNSUPPORTED'
    ? 'PARTIAL'
    : 'COMPLETE';

  return {
    status,
    warnings: uniqueWarnings(warnings),
    sources: sourceUrls(assumptions),
    fourPercentAnnual,
    sustainableRate,
    sustainableAnnual,
    guardrails: {
      initialAnnual: fourPercentAnnual,
      initialRate: FOUR_PERCENT_RATE,
      lowerRate: FOUR_PERCENT_RATE * (1 - GUARDRAIL_BAND),
      upperRate: FOUR_PERCENT_RATE * (1 + GUARDRAIL_BAND),
      spendingAdjustment: GUARDRAIL_SPENDING_ADJUSTMENT,
      annualSchedule: guardrailSchedule,
      educational: true,
    },
    buckets,
    method: {
      annualWithdrawalBase,
      fourPercent: {
        inflationRate: assumptions.inflation,
        annualSchedule: fourPercentSchedule,
        assumptions: ['A first-year withdrawal of 4% of the supplied retirement portfolio.', 'Each later displayed withdrawal is increased by the supplied planning inflation rate.'],
        limitations: ['A 4% guideline is an illustration, not a guarantee of portfolio longevity.', 'The displayed schedule does not model tax-aware account sequencing.'],
      },
      sustainableRate: {
        model: 'BOUNDED_BINARY_SEARCH',
        targetSuccessPercent,
        simulationRuns: SUSTAINABLE_RUNS,
        seed,
        toleranceDollars: SEARCH_TOLERANCE_DOLLARS,
        maxIterations: MAX_SEARCH_ITERATIONS,
        iterations,
        achievedSuccessPercent,
        annualSchedule: sustainableSchedule,
        assumptions: ['Every trial uses the identical seed and 5,000 simulation runs.', 'Each trial rescales the supplied annual withdrawal schedule to a proposed first-year draw.'],
        limitations: ['Monte Carlo estimates are hypothetical and depend on the supplied return, volatility, schedule, and seed.', 'Meeting the modeled target is not a guarantee and does not optimize taxes, RMDs, or account withdrawal order.'],
      },
      guardrails: {
        expectedReturn: input.meanReturn,
        assumptions: ['Starts at a 4% first-year withdrawal.', 'Raises planned spending by supplied inflation before testing the guardrail.', 'Cuts spending 10% above a 20% upper draw-rate band and raises it 10% below the lower band.'],
        limitations: ['The annual path uses the supplied expected return only as a deterministic teaching illustration.', 'It is not a Monte Carlo path, a tax-aware strategy, or an assurance that a client can maintain spending.'],
      },
      buckets: {
        assumptions: ['Cash target equals supplied withdrawals for years 1–2.', 'Bond target equals supplied withdrawals for years 3–10; remaining actual assets are assigned to growth.'],
        limitations: ['Bucket targets are funded only from the supplied portfolio and supplied withdrawal years.', 'A schedule shorter than 10 years leaves later bond needs unknown rather than assuming them.'],
      },
    },
  };
}
