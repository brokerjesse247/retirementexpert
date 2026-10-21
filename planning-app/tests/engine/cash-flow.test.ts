import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS } from '../../lib/assumptions/defaults';
import { calculateCashFlow } from '../../lib/calculations/cash-flow';
import type { PlanningAccount, PlanningAssumptions, PlanningInput, PlanningPerson } from '../../lib/calculations/types';

function person(overrides: Partial<PlanningPerson> = {}): PlanningPerson {
  return {
    role: 'PRIMARY', name: 'Alex Example', dob: '1976-01-15', ageMonths: 600,
    retirementAgeMonths: 50 * 12, planningAge: 50, earnedIncomeAnnual: 0,
    employeeContributionRate: 0, employerMatchRate: 0, combinedIraContributionAnnual: 0,
    iraContributionDestination: null, piaMonthly: 0, claimAgeMonths: null, alreadyReceiving: false,
    currentBenefitMonthly: null, benefitStartAgeMonths: null, pensionMonthly: 0,
    pensionStartAgeMonths: null, pensionSurvivorRate: null, pensionCola: null,
    annuityMonthly: 0, annuityStartAgeMonths: null, annuityQualification: null,
    rentalOtherMonthly: 0, rentalEndAgeMonths: null, partTimeAnnual: 0,
    partTimeEndAgeMonths: null, healthStatus: 'GOOD', lifeInsuranceDeathBenefit: 0,
    lifeInsuranceType: null, governmentNoncoveredPension: false,
    ...overrides,
  };
}

function account(type: PlanningAccount['type'], balance: number, extras: Partial<PlanningAccount> = {}): PlanningAccount {
  return {
    owner: 'PRIMARY', type, balance, costBasis: null,
    annuityQualification: null, hsaQualified: null,
    ...extras,
  };
}

function input(overrides: Partial<PlanningInput> = {}): PlanningInput {
  return {
    asOfDate: '2026-01-01', clientName: 'Alex Example', filingStatus: 'SINGLE', maritalStatus: 'SINGLE', state: 'CA',
    persons: [person()], accounts: [], currentMonthlySpending: 0, retirementMonthlySpending: 0,
    essentialMonthlySpending: null, discretionaryMonthlySpending: null, healthcareIncludedInSpending: true,
    homeValue: 0, mortgageBalance: 0, mortgageMonthlyPayment: 0, mortgagePayoffYear: null, debts: [], goals: [],
    riskProfile: 'MODERATE', riskScore: 15, allocation: null, familyLongevity: null, currentHealthCoverage: 'EMPLOYER',
    ltcInsured: null, ltcDailyBenefit: null, disabilityInsured: null, legacyGoal: 0, annualCharity: 0,
    dependents: 0, dependentsSpecialNeeds: false,
    estate: {
      will: { status: 'UNSURE', updatedYear: null }, livingTrust: { status: 'UNSURE', updatedYear: null },
      financialPoa: { status: 'UNSURE', updatedYear: null }, healthcareDirective: { status: 'UNSURE', updatedYear: null },
      updatedBeneficiaries: { status: 'UNSURE', updatedYear: null },
    },
    historicalMagi: {}, spouseLivedTogetherForMfs: false, warnings: [],
    ...overrides,
  };
}

function assumptions(): PlanningAssumptions {
  const value = structuredClone(DEFAULT_ASSUMPTIONS) as PlanningAssumptions;
  value.inflation = 0;
  value.healthcareInflation = 0;
  value.taxBracketInflation = 0;
  value.returnByRisk = { CONSERVATIVE: 0, MODERATE: 0, AGGRESSIVE: 0 };
  value.stateTaxRate = null;
  return value;
}

describe('cash-flow engine', () => {
  it('retains surplus RMD cash without inflating the portfolio and excludes it from net consumption', () => {
    const plan = input({
      persons: [person({ dob: '1951-01-15', ageMonths: 75 * 12, retirementAgeMonths: 65 * 12, planningAge: 75 })],
      accounts: [account('TRAD_IRA', 100_000)],
    });
    const result = calculateCashFlow(plan, assumptions());
    const row = result.rows[0];

    expect(row.rmd).toBeGreaterThan(0);
    expect(row.portfolioWithdrawal).toBeGreaterThanOrEqual(row.rmd);
    expect(row.netPortfolioDraw).toBeLessThan(row.rmd);
    // An RMD moved from a traditional account to retained cash cannot create assets.
    expect(row.endingBalance).toBeLessThanOrEqual(100_000);
    expect(row.taxDeferredBalance).toBeLessThan(100_000);
  });

  it('keeps the spouse’s wages while the primary is retired and uses them before portfolio funding', () => {
    const spouse = person({
      role: 'SPOUSE', name: 'Sam Example', dob: '1964-01-15', ageMonths: 62 * 12,
      retirementAgeMonths: 67 * 12, planningAge: 63, earnedIncomeAnnual: 60_000,
    });
    const plan = input({
      persons: [
        person({ dob: '1961-01-15', ageMonths: 65 * 12, retirementAgeMonths: 65 * 12, planningAge: 65 }),
        spouse,
      ],
      maritalStatus: 'MARRIED', filingStatus: 'MARRIED_FILING_JOINTLY', retirementMonthlySpending: 1_000,
    });
    const row = calculateCashFlow(plan, assumptions()).rows[0];

    expect(row.spouseAge).toBe(62);
    expect(row.wages).toBe(60_000);
    expect(row.portfolioNeed).toBe(0);
    expect(row.unmetNeed).toBe(0);
  });

  it('never creates a negative balance and reports a genuine cash shortfall', () => {
    const plan = input({
      accounts: [account('CASH', 100, { costBasis: 100 })],
      retirementMonthlySpending: 1_000,
    });
    const row = calculateCashFlow(plan, assumptions()).rows[0];

    expect(row.endingBalance).toBe(0);
    expect(row.taxableBalance).toBe(0);
    expect(row.portfolioNeed).toBe(12_000);
    expect(row.unmetNeed).toBe(11_900);
    expect(row.failed).toBe(true);
  });

  it('uses cash first, realizes brokerage gain from supplied basis, and leaves an empty portfolio failure visible', () => {
    const a = assumptions();
    a.annual.standardDeduction = { SINGLE: 0, MARRIED_FILING_JOINTLY: 0, MARRIED_FILING_SEPARATELY: 0, HEAD_OF_HOUSEHOLD: 0 };
    a.annual.additionalDeduction65 = { SINGLE: 0, MARRIED_FILING_JOINTLY: 0, MARRIED_FILING_SEPARATELY: 0, HEAD_OF_HOUSEHOLD: 0 };
    a.annual.seniorDeduction.amount = 0;
    a.annual.capitalGainsThresholds = {
      SINGLE: { zero: 0, fifteen: 1_000_000 }, MARRIED_FILING_JOINTLY: { zero: 0, fifteen: 1_000_000 },
      MARRIED_FILING_SEPARATELY: { zero: 0, fifteen: 1_000_000 }, HEAD_OF_HOUSEHOLD: { zero: 0, fifteen: 1_000_000 },
    };
    const plan = input({
      accounts: [account('CASH', 20, { costBasis: 20 }), account('BROKERAGE', 100, { costBasis: 40 })],
      retirementMonthlySpending: 10,
    });
    const row = calculateCashFlow(plan, a).rows[0];

    // $20 cash is tax-free cash; only the $100 brokerage sale realizes $60 of gain, taxed at 15%.
    expect(row.federalTax).toBe(9);
    expect(row.endingBalance).toBe(0);
    expect(row.portfolioNeed).toBe(129);
    expect(row.unmetNeed).toBe(9);
    expect(row.failed).toBe(true);
  });

  it('moves a scheduled Roth conversion from pre-tax to Roth without treating the transfer as spendable cash', () => {
    const plan = input({ accounts: [account('TRAD_IRA', 10_000)] });
    const row = calculateCashFlow(plan, assumptions(), { rothConversions: { '2026': 1_000 } }).rows[0];

    expect(row.rothConversion).toBe(1_000);
    expect(row.taxDeferredBalance).toBe(9_000);
    expect(row.rothBalance).toBe(1_000);
    expect(row.portfolioWithdrawal).toBe(0);
    expect(row.netPortfolioDraw).toBe(0);
    expect(row.endingBalance).toBe(10_000);
  });

  it('does not mutate saved inputs, assumptions, or option schedules', () => {
    const plan = input({ accounts: [account('TRAD_IRA', 10_000)] });
    const a = assumptions();
    const options = { rothConversions: { '2026': 1_000 }, extraExpenses: { '2026': 12.34 }, returnByYear: { '2026': 0 } };
    const before = structuredClone({ plan, a, options });

    calculateCashFlow(plan, a, options);

    expect({ plan, a, options }).toEqual(before);
  });
});
