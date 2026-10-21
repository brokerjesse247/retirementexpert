import type { NarrativeFact } from './types';

type RecordValue = Record<string, unknown>;

export function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function valueAt(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const segment of path.split('.')) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

export function finiteAt(value: unknown, path: string): number | null {
  const candidate = valueAt(value, path);
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
}

export function recordAt(value: unknown, path: string): RecordValue | null {
  const candidate = valueAt(value, path);
  return isRecord(candidate) ? candidate : null;
}

export function recordsAt(value: unknown, path: string): RecordValue[] {
  const candidate = valueAt(value, path);
  return Array.isArray(candidate) ? candidate.filter(isRecord) : [];
}

/** Template formatting mirrors the report's display convention; it never calculates a new value. */
export function money(value: number | null): string | null {
  if (value === null) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export function points(value: number | null): string | null {
  return value === null ? null : value.toFixed(1);
}

export function percent(value: number | null, unit: 'FRACTION' | 'POINTS'): string | null {
  if (value === null) return null;
  return `${(unit === 'FRACTION' ? value * 100 : value).toFixed(1)}%`;
}

export function integer(value: number | null): string | null {
  return value === null ? null : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function cleanText(value: unknown, max = 220): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export const CONCERN_LABELS: Record<string, string> = Object.freeze({
  RUNNING_OUT_OF_MONEY: 'making savings last',
  TAXES: 'taxes',
  HEALTHCARE: 'healthcare costs',
  MARKET_CRASH: 'market changes',
  LEAVING_A_LEGACY: 'leaving a legacy',
  LONG_TERM_CARE: 'long-term care',
  INFLATION: 'inflation',
});

export function narrativeConcerns(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => typeof item === 'string' ? CONCERN_LABELS[item] : undefined).filter((item): item is string => Boolean(item))
    : [];
}

export function safeFirstName(value: unknown): string {
  const plain = cleanText(value, 80).replace(/[0-9$%]/g, '').trim();
  return plain || 'there';
}

/**
 * This intentionally exposes a short, reviewed fact list to a future optional
 * provider rather than passing a raw analysis snapshot (which can contain names
 * in module details). The same list also powers the deterministic lookup.
 */
export function narrativeFacts(results: Record<string, unknown>): NarrativeFact[] {
  const facts: Array<NarrativeFact | null> = [
    fact('net-worth', 'Net worth', money(finiteAt(results, 'netWorth.netWorth')), 'netWorth.netWorth'),
    fact('investable-assets', 'Investable assets', money(finiteAt(results, 'netWorth.totalInvestable')), 'netWorth.totalInvestable'),
    fact('retirement-assets', 'Portfolio at retirement', money(finiteAt(results, 'cashFlow.portfolioAtRetirement')), 'cashFlow.portfolioAtRetirement'),
    fact('income-coverage', 'Income coverage', percent(finiteAt(results, 'cashFlow.incomeCoverageRatio'), 'FRACTION'), 'cashFlow.incomeCoverageRatio'),
    fact('depletion-age', 'Modeled depletion age', points(finiteAt(results, 'cashFlow.depletionAge')), 'cashFlow.depletionAge'),
    fact('lifetime-federal-tax', 'Projected lifetime federal tax', money(finiteAt(results, 'cashFlow.lifetimeFederalTax')), 'cashFlow.lifetimeFederalTax'),
    fact('monte-carlo-success', 'Monte Carlo success result', percent(finiteAt(results, 'monteCarlo.successPercent'), 'POINTS'), 'monteCarlo.successPercent'),
    fact('monte-carlo-median', 'Monte Carlo median ending value', money(finiteAt(results, 'monteCarlo.medianEnding')), 'monteCarlo.medianEnding'),
    fact('readiness-score', 'Readiness score', points(finiteAt(results, 'readiness.score')), 'readiness.score'),
    fact('current-federal-tax', 'Current federal tax result', money(finiteAt(results, 'taxes.current.federalTax')), 'taxes.current.federalTax'),
    fact('healthcare-lifetime', 'Lifetime healthcare cost', money(finiteAt(results, 'healthcare.lifetimeFutureCost')), 'healthcare.lifetimeFutureCost'),
    fact('hsa-years', 'Estimated HSA coverage years', points(finiteAt(results, 'healthcare.hsaCoverageYears')), 'healthcare.hsaCoverageYears'),
    fact('ltc-cost', 'Long-term care cost at age 85', money(finiteAt(results, 'ltc.costAt85')), 'ltc.costAt85'),
    fact('ltc-gap', 'Long-term care coverage gap', money(finiteAt(results, 'ltc.coverageGap')), 'ltc.coverageGap'),
    fact('insurance-need', 'Insurance needs-method gap', money(finiteAt(results, 'estate.insuranceNeed')), 'estate.insuranceNeed'),
    fact('planned-social-security', 'Planned Social Security lifetime value', money(finiteAt(results, 'socialSecurity.planned.presentValue')), 'socialSecurity.planned.presentValue'),
    fact('rmd-total', 'Projected total RMDs', money(finiteAt(results, 'roth.noConversion.totalRmd')), 'roth.noConversion.totalRmd'),
    fact('roth-tax-difference', 'Roth conversion lifetime federal tax difference', money(finiteAt(results, 'roth.lifetimeTaxDifference')), 'roth.lifetimeTaxDifference'),
    fact('target-equity', 'Current target equity', percent(finiteAt(results, 'allocation.target.currentEquity'), 'FRACTION'), 'allocation.target.currentEquity'),
  ];
  return facts.filter((fact): fact is NarrativeFact => fact !== null);
}

function fact(id: string, label: string, value: string | null, sourcePath: string): NarrativeFact | null {
  return value === null ? null : { id, label, value, sourcePath };
}

export function retirementRow(results: Record<string, unknown>): RecordValue | null {
  const retirementYear = finiteAt(results, 'cashFlow.retirementYear');
  return recordsAt(results, 'cashFlow.rows').find((row) => row.year === retirementYear) ?? recordsAt(results, 'cashFlow.rows')[0] ?? null;
}

export function textForFact(results: unknown, path: string, formatter: (value: number | null) => string | null): string | null {
  return formatter(finiteAt(results, path));
}
