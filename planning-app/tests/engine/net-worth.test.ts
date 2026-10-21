import { describe, expect, it } from 'vitest';
import { calculateNetWorth } from '../../lib/calculations/net-worth';
import type { PlanningAccount, PlanningAssumptions, PlanningInput } from '../../lib/calculations/types';

const assumptions = { sources: [] } as unknown as PlanningAssumptions;

function account(
  type: PlanningAccount['type'],
  balance: number,
  options: Pick<PlanningAccount, 'annuityQualification' | 'hsaQualified'> = { annuityQualification: null, hsaQualified: null },
): PlanningAccount {
  return { owner: 'PRIMARY', type, balance, costBasis: null, ...options };
}

function inputWith(accounts: PlanningAccount[], overrides: Partial<PlanningInput> = {}): PlanningInput {
  return {
    asOfDate: '2026-10-20',
    clientName: 'Test Client',
    filingStatus: 'SINGLE',
    maritalStatus: 'SINGLE',
    state: 'CA',
    persons: [],
    accounts,
    currentMonthlySpending: 2_000,
    retirementMonthlySpending: 1_500,
    essentialMonthlySpending: null,
    discretionaryMonthlySpending: null,
    healthcareIncludedInSpending: false,
    homeValue: 450_000,
    mortgageBalance: 110_000,
    mortgageMonthlyPayment: 1_000,
    mortgagePayoffYear: null,
    debts: [{ name: 'Auto loan', balance: 15.77, rate: 0.04, monthlyPayment: 200 }],
    goals: [],
    riskProfile: 'MODERATE',
    riskScore: 15,
    allocation: null,
    familyLongevity: null,
    currentHealthCoverage: null,
    ltcInsured: null,
    ltcDailyBenefit: null,
    disabilityInsured: null,
    legacyGoal: 0,
    annualCharity: 0,
    dependents: 0,
    dependentsSpecialNeeds: false,
    estate: {
      will: { status: 'UNSURE', updatedYear: null },
      livingTrust: { status: 'UNSURE', updatedYear: null },
      financialPoa: { status: 'UNSURE', updatedYear: null },
      healthcareDirective: { status: 'UNSURE', updatedYear: null },
      updatedBeneficiaries: { status: 'UNSURE', updatedYear: null },
    },
    historicalMagi: {},
    spouseLivedTogetherForMfs: false,
    warnings: [],
    ...overrides,
  };
}

describe('calculateNetWorth', () => {
  it('reconciles buckets and net worth without double-counting life cash value or mortgage debt', () => {
    const input = inputWith([
      account('K401_PRETAX', 100_001.11),
      account('TRAD_IRA', 200),
      account('ANNUITY', 400, { annuityQualification: 'QUALIFIED', hsaQualified: null }),
      account('ANNUITY', 500, { annuityQualification: 'NONQUALIFIED', hsaQualified: null }),
      account('ANNUITY', 50),
      account('ROTH_401K', 100),
      account('ROTH_IRA', 50),
      account('HSA', 25, { annuityQualification: null, hsaQualified: true }),
      account('HSA', 75),
      account('HSA', 10, { annuityQualification: null, hsaQualified: false }),
      account('BROKERAGE', 300),
      account('CASH', 120),
      account('CASH_VALUE_LIFE', 1_000),
    ]);
    const before = structuredClone(input);

    const result = calculateNetWorth(input, assumptions);

    expect(result).toMatchObject({
      totalInvestable: 101_831.11,
      taxDeferred: 100_601.11,
      taxFree: 175,
      taxable: 420,
      homeEquity: 340_000,
      netWorth: 442_815.34,
      emergencyFundMonths: 0.06,
      accountBreakdown: {
        taxDeferred: { workplacePretax: 100_001.11, traditionalIra: 200, qualifiedAnnuity: 400, total: 100_601.11 },
        taxFree: { roth401k: 100, rothIra: 50, hsaQualifiedUse: 25, total: 175 },
        taxable: { brokerage: 300, cash: 120, total: 420 },
        excludedFromTaxBuckets: {
          nonqualifiedAnnuity: 500,
          annuityQualificationUnknown: 50,
          hsaNonqualifiedUse: 10,
          hsaQualifiedUseUnknown: 75,
          total: 635,
        },
        cashValueLife: 1_000,
      },
    });
    expect(result.accountBreakdown.taxDeferred.total
      + result.accountBreakdown.taxFree.total
      + result.accountBreakdown.taxable.total
      + result.accountBreakdown.excludedFromTaxBuckets.total).toBe(result.totalInvestable);
    expect(result.meta.status).toBe('PARTIAL');
    expect(result.meta.warnings).toContain('Annuity tax qualification is unknown; its balance is included in investable assets but excluded from pretax/RMD and tax-diversification buckets.');
    expect(result.meta.warnings).toContain('HSA qualified-use status is unknown; that HSA balance is included in investable assets but not treated as tax-free.');
    expect(input).toStrictEqual(before);
  });

  it('uses a transparent normalized three-bucket diversification score', () => {
    const equalThreeBuckets = calculateNetWorth(inputWith([
      account('K401_PRETAX', 100),
      account('ROTH_IRA', 100),
      account('BROKERAGE', 100),
    ]), assumptions);
    const equalTwoBuckets = calculateNetWorth(inputWith([
      account('K401_PRETAX', 100),
      account('CASH', 100),
    ]), assumptions);

    expect(equalThreeBuckets.taxDiversificationScore).toBe(100);
    expect(equalThreeBuckets.taxDiversification).toMatchObject({
      method: 'NORMALIZED_THREE_BUCKET_CONCENTRATION',
      bucketCount: 3,
      includedBalance: 300,
      excludedBalance: 0,
      bucketShares: { taxDeferred: 0.333333, taxFree: 0.333333, taxable: 0.333333 },
    });
    expect(equalTwoBuckets.taxDiversificationScore).toBe(75);
  });

  it('returns null emergency months rather than dividing by zero', () => {
    const result = calculateNetWorth(inputWith([account('CASH', 12_000)], { currentMonthlySpending: 0 }), assumptions);

    expect(result.emergencyFundMonths).toBeNull();
    expect(result.meta.status).toBe('PARTIAL');
    expect(result.meta.warnings).toContain('Current monthly spending is zero, so emergency-fund months cannot be calculated.');
  });

  it('fails closed for negative balance-sheet inputs', () => {
    expect(() => calculateNetWorth(inputWith([account('CASH', -1)]), assumptions)).toThrow('accounts[0].balance must be a finite, non-negative amount.');
  });
});
