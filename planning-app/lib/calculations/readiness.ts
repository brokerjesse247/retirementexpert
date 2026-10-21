import { clamp, roundMoney } from './math';
import type { ModuleMeta } from './types';

/** Percentage-point weights prescribed by TODO.md §8.14; together they equal 100. */
export const READINESS_COMPONENT_WEIGHTS = Object.freeze({
  monteCarlo: 40,
  incomeCoverage: 20,
  taxDiversification: 15,
  emergencyFund: 10,
  insuranceProtection: 10,
  estateDocs: 5,
} as const);

export const READINESS_COMPONENT_KEYS = Object.freeze([
  'monteCarlo',
  'incomeCoverage',
  'taxDiversification',
  'emergencyFund',
  'insuranceProtection',
  'estateDocs',
] as const);

export type ReadinessComponentKey = (typeof READINESS_COMPONENT_KEYS)[number];
export type ReadinessComponentWeights = Readonly<Record<ReadinessComponentKey, number>>;
export type ReadinessComponents = Record<ReadinessComponentKey, number | null>;

export interface ReadinessArgs {
  /** Monte Carlo plan-success percentage, on a 0–100 scale. */
  monteCarloSuccess: number;
  /** Guaranteed-income coverage of essential spending, expressed as a ratio. */
  incomeCoverageRatio: number | null;
  /** Tax-bucket diversification score, on a 0–100 scale. */
  taxDiversificationScore: number;
  /** Available cash reserve expressed in months of current spending. */
  emergencyFundMonths: number | null;
  /** Insurance-protection score, on a 0–100 scale. */
  insuranceProtectionScore: number | null;
  /** Estate-document score, on a 0–100 scale. */
  estateDocsScore: number | null;
}

export interface ReadinessScoreDerivation {
  /** `score = sum(component score × component weight / 100)`. */
  formula: 'WEIGHTED_NORMALIZED_COMPONENTS';
  contributions: ReadinessComponents;
  total: number | null;
}

export interface ReadinessResult extends ModuleMeta {
  /** Null when a required component is unavailable; this is not an inferred score. */
  score: number | null;
  label: 'Excellent' | 'Good' | 'Needs Attention' | 'At Risk' | 'Incomplete';
  /** Normalized 0–100 component values before applying the displayed weights. */
  components: ReadinessComponents;
  componentWeights: ReadinessComponentWeights;
  scoreDerivation: ReadinessScoreDerivation;
}

const READINESS_SOURCE = 'Retirement Readiness Score formula (TODO.md §8.14)';

/**
 * Converts a supplied score to the 0–100 scoring range. Invalid values remain
 * unavailable so a headline cannot be created from an invented substitute.
 */
function normalizeScore(value: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return roundMoney(clamp(value, 0, 100));
}

/** Income coverage is fully credited once guaranteed income covers essentials. */
function normalizeIncomeCoverage(value: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return roundMoney(clamp(value, 0, 1) * 100);
}

/**
 * Readiness uses six months of spending as its explicit emergency-reserve
 * heuristic. More than six months cannot add points beyond this component's cap.
 */
function normalizeEmergencyFund(value: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return roundMoney(clamp(value / 6, 0, 1) * 100);
}

function weightedContribution(component: number | null, weight: number): number | null {
  return component === null ? null : roundMoney(component * weight / 100);
}

function labelForScore(score: number | null): ReadinessResult['label'] {
  if (score === null) return 'Incomplete';
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Needs Attention';
  return 'At Risk';
}

const COMPONENT_DISPLAY_NAMES: Readonly<Record<ReadinessComponentKey, string>> = Object.freeze({
  monteCarlo: 'Monte Carlo success result',
  incomeCoverage: 'essential-spending income coverage ratio',
  taxDiversification: 'tax diversification score',
  emergencyFund: 'emergency-fund months',
  insuranceProtection: 'insurance protection score',
  estateDocs: 'estate documents score',
});

/**
 * Produces the Section 8.14 household readiness headline from module outputs.
 * Inputs are never mutated. Each available component is normalized and bounded,
 * then its weighted contribution is rounded to cents; the headline is the sum
 * of those rounded contributions. A null or invalid required component blocks
 * the headline rather than being treated as zero or another assumed value.
 */
export function calculateReadiness(args: ReadinessArgs): ReadinessResult {
  const components: ReadinessComponents = {
    monteCarlo: normalizeScore(args.monteCarloSuccess),
    incomeCoverage: normalizeIncomeCoverage(args.incomeCoverageRatio),
    taxDiversification: normalizeScore(args.taxDiversificationScore),
    emergencyFund: normalizeEmergencyFund(args.emergencyFundMonths),
    insuranceProtection: normalizeScore(args.insuranceProtectionScore),
    estateDocs: normalizeScore(args.estateDocsScore),
  };

  const contributions: ReadinessComponents = {
    monteCarlo: weightedContribution(components.monteCarlo, READINESS_COMPONENT_WEIGHTS.monteCarlo),
    incomeCoverage: weightedContribution(components.incomeCoverage, READINESS_COMPONENT_WEIGHTS.incomeCoverage),
    taxDiversification: weightedContribution(components.taxDiversification, READINESS_COMPONENT_WEIGHTS.taxDiversification),
    emergencyFund: weightedContribution(components.emergencyFund, READINESS_COMPONENT_WEIGHTS.emergencyFund),
    insuranceProtection: weightedContribution(components.insuranceProtection, READINESS_COMPONENT_WEIGHTS.insuranceProtection),
    estateDocs: weightedContribution(components.estateDocs, READINESS_COMPONENT_WEIGHTS.estateDocs),
  };

  const missing = READINESS_COMPONENT_KEYS.filter((key) => components[key] === null);
  const score = missing.length === 0
    ? roundMoney(READINESS_COMPONENT_KEYS.reduce((total, key) => total + (contributions[key] ?? 0), 0))
    : null;
  const warnings = missing.map((key) => (
    `Readiness headline unavailable: ${COMPONENT_DISPLAY_NAMES[key]} is missing or invalid.`
  ));

  return {
    status: score === null ? 'PARTIAL' : 'COMPLETE',
    warnings,
    sources: [READINESS_SOURCE],
    score,
    label: labelForScore(score),
    components,
    componentWeights: READINESS_COMPONENT_WEIGHTS,
    scoreDerivation: {
      formula: 'WEIGHTED_NORMALIZED_COMPONENTS',
      contributions,
      total: score,
    },
  };
}
