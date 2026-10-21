import type { ModuleMeta, PlanningAssumptions, PlanningInput } from './types';
import { roundMoney, uniqueWarnings } from './math';

/**
 * This is a planning prompt, not a legal test for whether a trust is appropriate.
 * It intentionally remains separate from annually sourced financial assumptions.
 */
export const TRUST_EDUCATIONAL_HEURISTIC_ASSET_LEVEL = 500_000;

export type EstateChecklistStatus = 'CURRENT' | 'MISSING' | 'UNSURE' | 'REVIEW_DUE' | 'NOT_ASSESSED';
export type EstateChecklistKey =
  | 'will'
  | 'livingTrust'
  | 'financialPoa'
  | 'healthcareDirective'
  | 'beneficiaryDesignations'
  | 'transferDesignations'
  | 'digitalAssets';

export interface EstateChecklistItem {
  key: EstateChecklistKey;
  label: string;
  status: EstateChecklistStatus;
  lastUpdatedYear: number | null;
  detail: string;
}

/** A threshold comparison only; it is never an estate-tax calculation or legal conclusion. */
export interface EstateTaxFlag {
  status: 'BELOW_REPORTED_THRESHOLD' | 'REVIEW_WITH_ATTORNEY' | 'UNKNOWN';
  estimatedEstate: number;
  threshold: number | null;
  note: string;
}

export interface InsuranceNeedDetails {
  mortgage: number;
  otherDebts: number;
  survivorBudgetMonthly: number;
  survivorIncomeMonthly: number | null;
  survivorIncomeReplacement: number;
  incomeReplacementYears: number;
  finalExpenses: number;
  educationNeedIncluded: number;
  liquidAssetsUsed: number;
  existingLifeCoverage: number;
  grossNeed: number;
}

export interface EstateAndInsuranceResult extends ModuleMeta {
  /** Rounded DIME/needs-method coverage gap. This is not a carrier illustration or premium quote. */
  insuranceNeed: number;
  survivorIncomeGapMonthly: number;
  insuranceNeedDetails: InsuranceNeedDetails;
  checklist: EstateChecklistItem[];
  estateTaxFlag: EstateTaxFlag;
  stateEstateTaxFlag: EstateTaxFlag;
  /** `null` means the supplied status/year cannot establish the three-year review criterion. */
  beneficiaryReviewDue: boolean | null;
}

function requireNonnegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite, non-negative amount.`);
  return value;
}

function requirePercent(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${label} must be a fraction from 0 through 1.`);
  return value;
}

function requireYears(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite, non-negative number of years.`);
  return value;
}

function strictCalendarYear(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date.getUTCFullYear();
}

function isMortgageDebt(name: string): boolean {
  return /\bmortgage\b|\bhome\s+loan\b/i.test(name);
}

function sumAccountBalances(input: PlanningInput, allowedTypes: ReadonlySet<PlanningInput['accounts'][number]['type']>): number {
  const total = input.accounts
    .filter((account) => allowedTypes.has(account.type))
    .reduce((sum, account) => sum + requireNonnegative(account.balance, `Account balance (${account.type})`), 0);
  return roundMoney(total);
}

function sumExistingLifeCoverage(input: PlanningInput): number {
  return roundMoney(input.persons.reduce(
    (sum, person) => sum + requireNonnegative(person.lifeInsuranceDeathBenefit, `${person.name || person.role} life-insurance death benefit`),
    0,
  ));
}

function taxFlag(estimatedEstate: number, threshold: number | null | undefined, scope: 'federal' | 'state'): EstateTaxFlag {
  const suppliedThreshold = threshold ?? 0;
  if (!Number.isFinite(suppliedThreshold) || suppliedThreshold <= 0) {
    return {
      status: 'UNKNOWN',
      estimatedEstate,
      threshold: null,
      note: `No verified ${scope} estate threshold was supplied, so no ${scope} estate-tax estimate is made.`,
    };
  }
  const roundedThreshold = roundMoney(suppliedThreshold);
  return estimatedEstate > roundedThreshold
    ? {
      status: 'REVIEW_WITH_ATTORNEY',
      estimatedEstate,
      threshold: roundedThreshold,
      note: `The estimated estate proxy exceeds the supplied ${scope} threshold; consult a qualified estate attorney. This is not an estate-tax calculation.`,
    }
    : {
      status: 'BELOW_REPORTED_THRESHOLD',
      estimatedEstate,
      threshold: roundedThreshold,
      note: `The estimated estate proxy is below the supplied ${scope} threshold. This is not a legal conclusion or an estate-tax calculation.`,
    };
}

function documentChecklistItem(
  key: Exclude<EstateChecklistKey, 'beneficiaryDesignations' | 'transferDesignations' | 'digitalAssets'>,
  label: string,
  document: PlanningInput['estate']['will'],
  detailForYes: string,
): EstateChecklistItem {
  if (document.status === 'NO') return { key, label, status: 'MISSING', lastUpdatedYear: document.updatedYear, detail: `${label} is reported missing.` };
  if (document.status === 'UNSURE') return { key, label, status: 'UNSURE', lastUpdatedYear: document.updatedYear, detail: `${label} status is unsure; verify it with the appropriate professional.` };
  return { key, label, status: 'CURRENT', lastUpdatedYear: document.updatedYear, detail: detailForYes };
}

function beneficiaryChecklist(
  document: PlanningInput['estate']['updatedBeneficiaries'],
  asOfYear: number | null,
): { item: EstateChecklistItem; reviewDue: boolean | null } {
  if (document.status === 'NO') {
    return {
      item: { key: 'beneficiaryDesignations', label: 'Beneficiary designations', status: 'MISSING', lastUpdatedYear: document.updatedYear, detail: 'Beneficiary designations are reported missing or not updated; review every account and policy.' },
      reviewDue: true,
    };
  }
  if (document.status === 'UNSURE') {
    return {
      item: { key: 'beneficiaryDesignations', label: 'Beneficiary designations', status: 'UNSURE', lastUpdatedYear: document.updatedYear, detail: 'Beneficiary designation status is unsure; review every account and policy.' },
      reviewDue: true,
    };
  }
  if (asOfYear === null || document.updatedYear === null || !Number.isInteger(document.updatedYear) || document.updatedYear > asOfYear) {
    return {
      item: { key: 'beneficiaryDesignations', label: 'Beneficiary designations', status: 'REVIEW_DUE', lastUpdatedYear: document.updatedYear, detail: 'The supplied update year cannot confirm that beneficiary designations were reviewed within the last three years.' },
      reviewDue: null,
    };
  }
  const reviewDue = asOfYear - document.updatedYear > 3;
  return {
    item: {
      key: 'beneficiaryDesignations',
      label: 'Beneficiary designations',
      status: reviewDue ? 'REVIEW_DUE' : 'CURRENT',
      lastUpdatedYear: document.updatedYear,
      detail: reviewDue
        ? 'Beneficiary designations were last updated more than three years before the plan as-of year.'
        : 'Beneficiary designations were updated within the three years preceding the plan as-of year.',
    },
    reviewDue,
  };
}

/**
 * Calculates a DIME/needs-method insurance gap and a non-legal estate-document review checklist.
 * Annual estate thresholds and all planning defaults are supplied by the caller through assumptions.
 */
export function calculateEstateAndInsurance(
  input: PlanningInput,
  assumptions: PlanningAssumptions,
  survivorIncomeMonthly?: number,
): EstateAndInsuranceResult {
  const warnings: string[] = [];
  let status: ModuleMeta['status'] = 'COMPLETE';

  const survivorSpendingPercent = requirePercent(assumptions.survivorSpendingPercent, 'Survivor spending percentage');
  const incomeReplacementYears = requireYears(assumptions.incomeReplacementYears, 'Income replacement years');
  const finalExpenses = roundMoney(requireNonnegative(assumptions.finalExpenses, 'Final expenses'));
  const retirementSpending = requireNonnegative(input.retirementMonthlySpending, 'Retirement monthly spending');
  const mortgage = roundMoney(requireNonnegative(input.mortgageBalance, 'Mortgage balance'));

  const mortgageDebtRows = input.debts.filter((debt) => isMortgageDebt(debt.name));
  const otherDebts = roundMoney(input.debts
    .filter((debt) => mortgage === 0 || !isMortgageDebt(debt.name))
    .reduce((sum, debt) => sum + requireNonnegative(debt.balance, `Debt balance (${debt.name || 'unnamed debt'})`), 0));
  if (mortgage > 0 && mortgageDebtRows.length > 0) {
    warnings.push('Debt rows labelled as a mortgage were excluded because the separate mortgage balance is already included once.');
  }

  const survivorBudgetMonthly = roundMoney(retirementSpending * survivorSpendingPercent);
  const survivorIncomeKnown = survivorIncomeMonthly !== undefined;
  const survivorIncome = survivorIncomeKnown
    ? roundMoney(requireNonnegative(survivorIncomeMonthly, 'Survivor income monthly'))
    : null;
  if (!survivorIncomeKnown) {
    status = 'PARTIAL';
    warnings.push('Actual survivor income was not supplied; the insurance gap conservatively assumes $0 of monthly survivor income.');
  }
  const survivorIncomeGapMonthly = roundMoney(Math.max(0, survivorBudgetMonthly - (survivorIncome ?? 0)));
  const survivorIncomeReplacement = roundMoney(survivorIncomeGapMonthly * 12 * incomeReplacementYears);

  const liquidAssetsUsed = sumAccountBalances(input, new Set(['CASH', 'BROKERAGE']));
  const excludedRestrictedAssets = sumAccountBalances(input, new Set(['K401_PRETAX', 'ROTH_401K', 'TRAD_IRA', 'ROTH_IRA', 'HSA', 'ANNUITY', 'CASH_VALUE_LIFE']));
  if (excludedRestrictedAssets > 0) {
    warnings.push('Retirement, HSA, annuity, and cash-value life balances are not treated as liquid DIME offsets because access, taxes, and use restrictions were not established.');
  }

  const existingLifeCoverage = sumExistingLifeCoverage(input);
  const grossNeed = roundMoney(mortgage + otherDebts + survivorIncomeReplacement + finalExpenses);
  const insuranceNeed = roundMoney(Math.max(0, grossNeed - liquidAssetsUsed - existingLifeCoverage));
  warnings.push('The coverage gap is a planning estimate, not a carrier illustration, underwriting decision, product recommendation, or premium quote.');

  const assetBalances = sumAccountBalances(input, new Set(['K401_PRETAX', 'ROTH_401K', 'TRAD_IRA', 'ROTH_IRA', 'HSA', 'BROKERAGE', 'CASH', 'ANNUITY', 'CASH_VALUE_LIFE']));
  const homeValue = requireNonnegative(input.homeValue, 'Home value');
  const estimatedEstate = roundMoney(assetBalances + homeValue - mortgage - otherDebts);
  const estateTaxFlag = taxFlag(estimatedEstate, assumptions.annual.estateExemption, 'federal');
  const stateEstateTaxFlag = taxFlag(estimatedEstate, assumptions.stateEstateThreshold, 'state');
  if (estateTaxFlag.status === 'UNKNOWN') {
    status = 'PARTIAL';
    warnings.push('Federal estate threshold is unavailable or invalid; no federal estate-tax comparison was made.');
  }
  if (stateEstateTaxFlag.status === 'UNKNOWN') {
    status = 'PARTIAL';
    warnings.push('State estate or inheritance tax is unmodeled because no state threshold was supplied; no state exemption was invented.');
  }

  const asOfYear = strictCalendarYear(input.asOfDate);
  if (asOfYear === null) {
    status = 'PARTIAL';
    warnings.push('The plan as-of date is invalid, so the three-year beneficiary-review criterion cannot be determined.');
  }
  const beneficiaries = beneficiaryChecklist(input.estate.updatedBeneficiaries, asOfYear);
  if (beneficiaries.reviewDue === null) {
    status = 'PARTIAL';
    warnings.push('Beneficiary review timing is unknown because a valid as-of year and past update year are required.');
  }

  const trust = input.estate.livingTrust;
  const trustDetail = trust.status === 'NO'
    ? estimatedEstate > TRUST_EDUCATIONAL_HEURISTIC_ASSET_LEVEL
      ? `No living trust is reported. The estimated estate proxy exceeds the $${TRUST_EDUCATIONAL_HEURISTIC_ASSET_LEVEL.toLocaleString('en-US')} educational discussion heuristic; this does not establish that a trust is legally needed.`
      : 'No living trust is reported. Discuss whether one is appropriate with an estate attorney based on the client’s circumstances.'
    : trust.status === 'UNSURE'
      ? 'Living-trust status is unsure; verify the document and whether assets are titled or funded as intended.'
      : 'A living trust is reported. Its terms, funding, beneficiary designations, and legal effect have not been reviewed by this engine.';

  const checklist: EstateChecklistItem[] = [
    documentChecklistItem('will', 'Will', input.estate.will, 'A will is reported. Its validity, currency, and provisions are not legally reviewed by this engine.'),
    {
      key: 'livingTrust',
      label: 'Living trust',
      status: trust.status === 'YES' ? 'CURRENT' : trust.status === 'NO' ? 'MISSING' : 'UNSURE',
      lastUpdatedYear: trust.updatedYear,
      detail: trustDetail,
    },
    documentChecklistItem('financialPoa', 'Financial power of attorney', input.estate.financialPoa, 'A financial power of attorney is reported. Its scope and current effectiveness are not legally reviewed by this engine.'),
    documentChecklistItem('healthcareDirective', 'Healthcare directive', input.estate.healthcareDirective, 'A healthcare directive is reported. Its scope and current effectiveness are not legally reviewed by this engine.'),
    beneficiaries.item,
    { key: 'transferDesignations', label: 'TOD/POD and account-transfer designations', status: 'NOT_ASSESSED', lastUpdatedYear: null, detail: 'TOD/POD and account-transfer designations are not captured in the planning input; verify them directly.' },
    { key: 'digitalAssets', label: 'Digital asset inventory and access plan', status: 'NOT_ASSESSED', lastUpdatedYear: null, detail: 'Digital asset planning is not captured in the planning input; discuss it with the estate-planning professional.' },
  ];

  if (input.dependentsSpecialNeeds) {
    warnings.push('A dependent with special needs is reported; discuss specialized planning with an estate attorney. This engine does not determine trust suitability.');
  }
  warnings.push('Sole-spouse beneficiary status and ownership/titling of assets are not captured; no transfer or estate-tax conclusion is inferred from them.');
  warnings.push('Real estate in additional states and privacy preferences are not captured; the living-trust heuristic does not determine whether a trust is appropriate and does not imply that probate is avoided.');

  const sources = uniqueWarnings([
    ...assumptions.sources.map((source) => source.url),
    ...assumptions.annual.sources.map((source) => source.url),
  ]);

  return {
    status,
    warnings: uniqueWarnings(warnings),
    sources,
    insuranceNeed,
    survivorIncomeGapMonthly,
    insuranceNeedDetails: {
      mortgage,
      otherDebts,
      survivorBudgetMonthly,
      survivorIncomeMonthly: survivorIncome,
      survivorIncomeReplacement,
      incomeReplacementYears,
      finalExpenses,
      educationNeedIncluded: 0,
      liquidAssetsUsed,
      existingLifeCoverage,
      grossNeed,
    },
    checklist,
    estateTaxFlag,
    stateEstateTaxFlag,
    beneficiaryReviewDue: beneficiaries.reviewDue,
  };
}
