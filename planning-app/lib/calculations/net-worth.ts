import { roundMoney } from './math';
import type { ModuleMeta, PlanningAccount, PlanningAssumptions, PlanningInput } from './types';

export interface NetWorthAccountBreakdown {
  taxDeferred: {
    workplacePretax: number;
    traditionalIra: number;
    qualifiedAnnuity: number;
    total: number;
  };
  taxFree: {
    roth401k: number;
    rothIra: number;
    hsaQualifiedUse: number;
    total: number;
  };
  taxable: {
    brokerage: number;
    cash: number;
    total: number;
  };
  excludedFromTaxBuckets: {
    nonqualifiedAnnuity: number;
    annuityQualificationUnknown: number;
    hsaNonqualifiedUse: number;
    hsaQualifiedUseUnknown: number;
    total: number;
  };
  cashValueLife: number;
}

/** Inputs and calculation details behind the readiness-compatible tax-diversification score. */
export interface TaxDiversificationDetail {
  method: 'NORMALIZED_THREE_BUCKET_CONCENTRATION';
  bucketCount: number;
  includedBalance: number;
  excludedBalance: number;
  bucketShares: { taxDeferred: number; taxFree: number; taxable: number };
}

export interface NetWorthResult {
  meta: ModuleMeta;
  totalInvestable: number;
  taxDeferred: number;
  taxFree: number;
  taxable: number;
  homeEquity: number;
  netWorth: number;
  emergencyFundMonths: number | null;
  taxDiversificationScore: number;
  taxDiversification: TaxDiversificationDetail;
  accountBreakdown: NetWorthAccountBreakdown;
}

type Amounts = {
  workplacePretax: number;
  traditionalIra: number;
  qualifiedAnnuity: number;
  nonqualifiedAnnuity: number;
  annuityQualificationUnknown: number;
  roth401k: number;
  rothIra: number;
  hsaQualifiedUse: number;
  hsaNonqualifiedUse: number;
  hsaQualifiedUseUnknown: number;
  brokerage: number;
  cash: number;
  cashValueLife: number;
};

function money(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite, non-negative amount.`);
  }
  return value;
}

function roundedRatio(value: number): number {
  return Number(value.toFixed(6));
}

function taxDiversificationScore(taxDeferred: number, taxFree: number, taxable: number): number {
  const includedBalance = taxDeferred + taxFree + taxable;
  if (includedBalance <= 0) return 0;

  const shares = [taxDeferred, taxFree, taxable].map((balance) => balance / includedBalance);
  const concentration = shares.reduce((sum, share) => sum + share * share, 0);
  // Normalizes the three-bucket concentration range: one bucket = 0, equal thirds = 100.
  return roundMoney(((1 - concentration) / (1 - (1 / 3))) * 100);
}

/**
 * Produces a current household balance sheet without applying tax, RMD, or annual-rule assumptions.
 * Cash-value life insurance is deliberately excluded from investable assets, then added once to net worth.
 */
export function calculateNetWorth(input: PlanningInput, _assumptions: PlanningAssumptions): NetWorthResult {
  void _assumptions;

  const amounts: Amounts = {
    workplacePretax: 0,
    traditionalIra: 0,
    qualifiedAnnuity: 0,
    nonqualifiedAnnuity: 0,
    annuityQualificationUnknown: 0,
    roth401k: 0,
    rothIra: 0,
    hsaQualifiedUse: 0,
    hsaNonqualifiedUse: 0,
    hsaQualifiedUseUnknown: 0,
    brokerage: 0,
    cash: 0,
    cashValueLife: 0,
  };
  const warnings: string[] = [];

  for (const [index, account] of input.accounts.entries()) {
    const balance = money(account.balance, `accounts[${index}].balance`);
    addAccountBalance(amounts, account, balance);
  }

  const homeValue = money(input.homeValue, 'homeValue');
  const mortgageBalance = money(input.mortgageBalance, 'mortgageBalance');
  const currentMonthlySpending = money(input.currentMonthlySpending, 'currentMonthlySpending');
  const otherDebts = input.debts.reduce(
    (sum, debt, index) => sum + money(debt.balance, `debts[${index}].balance`),
    0,
  );

  const taxDeferred = roundMoney(amounts.workplacePretax + amounts.traditionalIra + amounts.qualifiedAnnuity);
  const taxFree = roundMoney(amounts.roth401k + amounts.rothIra + amounts.hsaQualifiedUse);
  const taxable = roundMoney(amounts.brokerage + amounts.cash);
  const excludedFromTaxBuckets = roundMoney(
    amounts.nonqualifiedAnnuity
      + amounts.annuityQualificationUnknown
      + amounts.hsaNonqualifiedUse
      + amounts.hsaQualifiedUseUnknown,
  );
  const totalInvestable = roundMoney(taxDeferred + taxFree + taxable + excludedFromTaxBuckets);
  const cashValueLife = roundMoney(amounts.cashValueLife);
  const homeEquity = roundMoney(homeValue - mortgageBalance);
  const netWorth = roundMoney(totalInvestable + cashValueLife + homeEquity - otherDebts);

  const includedBalance = roundMoney(taxDeferred + taxFree + taxable);
  const bucketShares = includedBalance > 0
    ? {
        taxDeferred: roundedRatio(taxDeferred / includedBalance),
        taxFree: roundedRatio(taxFree / includedBalance),
        taxable: roundedRatio(taxable / includedBalance),
      }
    : { taxDeferred: 0, taxFree: 0, taxable: 0 };
  const bucketCount = [taxDeferred, taxFree, taxable].filter((balance) => balance > 0).length;

  if (amounts.annuityQualificationUnknown > 0) {
    warnings.push('Annuity tax qualification is unknown; its balance is included in investable assets but excluded from pretax/RMD and tax-diversification buckets.');
  }
  if (amounts.hsaQualifiedUseUnknown > 0) {
    warnings.push('HSA qualified-use status is unknown; that HSA balance is included in investable assets but not treated as tax-free.');
  }
  if (amounts.hsaNonqualifiedUse > 0) {
    warnings.push('HSA qualified-use status is not confirmed; that HSA balance is included in investable assets but not treated as tax-free.');
  }
  if (includedBalance === 0 && totalInvestable > 0) {
    warnings.push('No balance is confirmed in a taxable, tax-deferred, or tax-free bucket; tax diversification is scored as 0 until account tax treatment is clarified.');
  }

  const emergencyFundMonths = currentMonthlySpending > 0
    ? roundMoney(amounts.cash / currentMonthlySpending)
    : null;
  if (currentMonthlySpending === 0) {
    warnings.push('Current monthly spending is zero, so emergency-fund months cannot be calculated.');
  }

  return {
    meta: {
      status: warnings.length > 0 ? 'PARTIAL' : 'COMPLETE',
      warnings,
      // This balance-sheet module consumes no annual law/rule values. Its source data are the supplied account and debt inputs.
      sources: [],
    },
    totalInvestable,
    taxDeferred,
    taxFree,
    taxable,
    homeEquity,
    netWorth,
    emergencyFundMonths,
    taxDiversificationScore: taxDiversificationScore(taxDeferred, taxFree, taxable),
    taxDiversification: {
      method: 'NORMALIZED_THREE_BUCKET_CONCENTRATION',
      bucketCount,
      includedBalance,
      excludedBalance: excludedFromTaxBuckets,
      bucketShares,
    },
    accountBreakdown: {
      taxDeferred: {
        workplacePretax: roundMoney(amounts.workplacePretax),
        traditionalIra: roundMoney(amounts.traditionalIra),
        qualifiedAnnuity: roundMoney(amounts.qualifiedAnnuity),
        total: taxDeferred,
      },
      taxFree: {
        roth401k: roundMoney(amounts.roth401k),
        rothIra: roundMoney(amounts.rothIra),
        hsaQualifiedUse: roundMoney(amounts.hsaQualifiedUse),
        total: taxFree,
      },
      taxable: {
        brokerage: roundMoney(amounts.brokerage),
        cash: roundMoney(amounts.cash),
        total: taxable,
      },
      excludedFromTaxBuckets: {
        nonqualifiedAnnuity: roundMoney(amounts.nonqualifiedAnnuity),
        annuityQualificationUnknown: roundMoney(amounts.annuityQualificationUnknown),
        hsaNonqualifiedUse: roundMoney(amounts.hsaNonqualifiedUse),
        hsaQualifiedUseUnknown: roundMoney(amounts.hsaQualifiedUseUnknown),
        total: excludedFromTaxBuckets,
      },
      cashValueLife,
    },
  };
}

function addAccountBalance(amounts: Amounts, account: PlanningAccount, balance: number): void {
  switch (account.type) {
    case 'K401_PRETAX':
      amounts.workplacePretax += balance;
      return;
    case 'TRAD_IRA':
      amounts.traditionalIra += balance;
      return;
    case 'ROTH_401K':
      amounts.roth401k += balance;
      return;
    case 'ROTH_IRA':
      amounts.rothIra += balance;
      return;
    case 'BROKERAGE':
      amounts.brokerage += balance;
      return;
    case 'CASH':
      amounts.cash += balance;
      return;
    case 'CASH_VALUE_LIFE':
      amounts.cashValueLife += balance;
      return;
    case 'ANNUITY':
      if (account.annuityQualification === 'QUALIFIED') amounts.qualifiedAnnuity += balance;
      else if (account.annuityQualification === 'NONQUALIFIED') amounts.nonqualifiedAnnuity += balance;
      else amounts.annuityQualificationUnknown += balance;
      return;
    case 'HSA':
      if (account.hsaQualified === true) amounts.hsaQualifiedUse += balance;
      else if (account.hsaQualified === false) amounts.hsaNonqualifiedUse += balance;
      else amounts.hsaQualifiedUseUnknown += balance;
      return;
    default: {
      const unreachable: never = account.type;
      throw new Error(`Unsupported account type: ${unreachable}`);
    }
  }
}
