import { describe, expect, it } from 'vitest';
import {
  calculateHealthcare,
  calculateMedicarePremium,
  healthcareCostAtYear,
} from '../../lib/calculations/healthcare';
import type { AnnualRules, PlanningAssumptions, PlanningInput } from '../../lib/calculations/types';

const rules: AnnualRules = {
  year: 2026,
  taxBrackets: {
    SINGLE: [],
    MARRIED_FILING_JOINTLY: [],
    MARRIED_FILING_SEPARATELY: [],
    HEAD_OF_HOUSEHOLD: [],
  },
  standardDeduction: { SINGLE: 0, MARRIED_FILING_JOINTLY: 0, MARRIED_FILING_SEPARATELY: 0, HEAD_OF_HOUSEHOLD: 0 },
  additionalDeduction65: { SINGLE: 0, MARRIED_FILING_JOINTLY: 0, MARRIED_FILING_SEPARATELY: 0, HEAD_OF_HOUSEHOLD: 0 },
  seniorDeduction: {
    amount: 0,
    phaseoutStart: { SINGLE: 0, MARRIED_FILING_JOINTLY: 0, MARRIED_FILING_SEPARATELY: 0, HEAD_OF_HOUSEHOLD: 0 },
    phaseoutRate: 0,
    endYear: 2026,
    eligibleFilingStatuses: [],
  },
  capitalGainsThresholds: {
    SINGLE: { zero: 0, fifteen: 0 },
    MARRIED_FILING_JOINTLY: { zero: 0, fifteen: 0 },
    MARRIED_FILING_SEPARATELY: { zero: 0, fifteen: 0 },
    HEAD_OF_HOUSEHOLD: { zero: 0, fifteen: 0 },
  },
  contributions: { workplace: 0, workplaceCatchup50: 0, workplaceCatchup60to63: 0, ira: 0, iraCatchup50: 0, hsaSelf: 0, hsaFamily: 0, hsaCatchup55: 0 },
  socialSecurity: {
    earningsUnderFra: 0,
    earningsFraYear: 0,
    taxableMaximum: 0,
    cola: 0,
    taxThresholds: {
      SINGLE: { base1: 0, base2: 0, cap: 0 },
      MARRIED_FILING_JOINTLY: { base1: 0, base2: 0, cap: 0 },
      MARRIED_FILING_SEPARATELY: { base1: 0, base2: 0, cap: 0 },
      HEAD_OF_HOUSEHOLD: { base1: 0, base2: 0, cap: 0 },
    },
  },
  medicare: {
    partBStandard: 202.9,
    irmaaSingle: [
      { upTo: 109000, partBMonthly: 202.9, partDMonthly: 0 },
      { upTo: 137000, partBMonthly: 284.1, partDMonthly: 14.5 },
      { upTo: 171000, partBMonthly: 405.8, partDMonthly: 37.5 },
      { upTo: 205000, partBMonthly: 527.5, partDMonthly: 60.4 },
      { upTo: 500000, upperExclusive: true, partBMonthly: 649.2, partDMonthly: 83.3 },
      { upTo: null, partBMonthly: 689.9, partDMonthly: 91 },
    ],
    irmaaJoint: [
      { upTo: 218000, partBMonthly: 202.9, partDMonthly: 0 },
      { upTo: 274000, partBMonthly: 284.1, partDMonthly: 14.5 },
      { upTo: 342000, partBMonthly: 405.8, partDMonthly: 37.5 },
      { upTo: 410000, partBMonthly: 527.5, partDMonthly: 60.4 },
      { upTo: 750000, upperExclusive: true, partBMonthly: 649.2, partDMonthly: 83.3 },
      { upTo: null, partBMonthly: 689.9, partDMonthly: 91 },
    ],
    irmaaSeparate: [
      { upTo: 109000, partBMonthly: 202.9, partDMonthly: 0 },
      { upTo: 391000, upperExclusive: true, partBMonthly: 649.2, partDMonthly: 83.3 },
      { upTo: null, partBMonthly: 689.9, partDMonthly: 91 },
    ],
  },
  rmdUniform: {},
  estateExemption: 0,
  giftExclusion: 0,
  qcdLimit: 0,
  sources: [],
};

const assumptions: PlanningAssumptions = {
  year: 2026,
  version: 'healthcare-test',
  annual: rules,
  inflation: 0.025,
  healthcareInflation: 0,
  socialSecurityCola: 0.025,
  returnByRisk: { CONSERVATIVE: 0.05, MODERATE: 0.065, AGGRESSIVE: 0.075 },
  volatilityByRisk: { CONSERVATIVE: 0.07, MODERATE: 0.11, AGGRESSIVE: 0.15 },
  planningAgeDefault: 95,
  planningAgeExcellentLongevity: 100,
  planningAgePoorHealth: 90,
  monteCarloRuns: 5000,
  monteCarloSeed: 42,
  monteCarloTarget: 0.85,
  preMedicareMonthly: 900,
  supplementalMedicareMonthly: 250,
  medicalOutOfPocketAnnual: 2500,
  ltcMonthly: 9000,
  ltcYears: 3,
  ltcEventAge: 85,
  stateTaxRate: null,
  stateEstateThreshold: null,
  taxBracketInflation: 0.025,
  futureRulePolicy: 'PROJECT_CURRENT_RULES',
  targetTaxBracket: 0.22,
  heirsTaxRate: 0.24,
  realDiscountRate: 0.03,
  targetEquity: { CONSERVATIVE: 0.35, MODERATE: 0.55, AGGRESSIVE: 0.75 },
  finalExpenses: 15000,
  survivorSpendingPercent: 0.75,
  incomeReplacementYears: 10,
  sources: [],
};

function input(overrides: Partial<PlanningInput> = {}): PlanningInput {
  const base: PlanningInput = {
    asOfDate: '2026-01-01',
    clientName: 'Healthcare Test',
    filingStatus: 'SINGLE',
    maritalStatus: 'Single',
    state: 'CA',
    persons: [{
      role: 'PRIMARY', name: 'Avery', dob: '1960-06-15', ageMonths: 786,
      retirementAgeMonths: 780, planningAge: 67, earnedIncomeAnnual: 0,
      employeeContributionRate: 0, employerMatchRate: 0, combinedIraContributionAnnual: 0,
      iraContributionDestination: null, piaMonthly: 0, claimAgeMonths: null,
      alreadyReceiving: false, currentBenefitMonthly: null, benefitStartAgeMonths: null,
      pensionMonthly: 0, pensionStartAgeMonths: null, pensionSurvivorRate: null,
      pensionCola: null, annuityMonthly: 0, annuityStartAgeMonths: null,
      annuityQualification: null, rentalOtherMonthly: 0, rentalEndAgeMonths: null,
      partTimeAnnual: 0, partTimeEndAgeMonths: null, healthStatus: null,
      lifeInsuranceDeathBenefit: 0, lifeInsuranceType: null, governmentNoncoveredPension: false,
    }],
    accounts: [], currentMonthlySpending: 0, retirementMonthlySpending: 0,
    essentialMonthlySpending: null, discretionaryMonthlySpending: null,
    healthcareIncludedInSpending: false, homeValue: 0, mortgageBalance: 0,
    mortgageMonthlyPayment: 0, mortgagePayoffYear: null, debts: [], goals: [],
    riskProfile: 'MODERATE', riskScore: 15, allocation: null, familyLongevity: null,
    currentHealthCoverage: 'Retiree plan', ltcInsured: null, ltcDailyBenefit: null,
    disabilityInsured: null, legacyGoal: 0, annualCharity: 0, dependents: 0,
    dependentsSpecialNeeds: false,
    estate: {
      will: { status: 'UNSURE', updatedYear: null }, livingTrust: { status: 'UNSURE', updatedYear: null },
      financialPoa: { status: 'UNSURE', updatedYear: null }, healthcareDirective: { status: 'UNSURE', updatedYear: null },
      updatedBeneficiaries: { status: 'UNSURE', updatedYear: null },
    },
    historicalMagi: {}, spouseLivedTogetherForMfs: false, warnings: [],
  };
  return { ...base, ...overrides };
}

describe('healthcare and Medicare engine', () => {
  it('uses annual-rule 2026 values for the required single $120,000 IRMAA case', () => {
    expect(calculateMedicarePremium(120000, 'SINGLE', rules)).toEqual({ partBMonthly: 284.1, partDMonthly: 14.5, tier: 1 });
  });

  it('honors CMS exclusive top thresholds for individual and joint filers', () => {
    expect(calculateMedicarePremium(499999.99, 'SINGLE', rules).tier).toBe(4);
    expect(calculateMedicarePremium(500000, 'SINGLE', rules).tier).toBe(5);
    expect(calculateMedicarePremium(749999.99, 'MARRIED_FILING_JOINTLY', rules).tier).toBe(4);
    expect(calculateMedicarePremium(750000, 'MARRIED_FILING_JOINTLY', rules).tier).toBe(5);
  });

  it('uses the special MFS table only if spouses lived together during the taxable year', () => {
    expect(calculateMedicarePremium(120000, 'MARRIED_FILING_SEPARATELY', rules, true)).toMatchObject({ partBMonthly: 649.2, partDMonthly: 83.3, tier: 1 });
    expect(calculateMedicarePremium(120000, 'MARRIED_FILING_SEPARATELY', rules, false)).toMatchObject({ partBMonthly: 284.1, partDMonthly: 14.5, tier: 1 });
  });

  it('uses exactly the two-year MAGI lookback and warns instead of inventing missing history', () => {
    const personWithinHorizon = { ...input().persons[0], planningAge: 70 };
    const withHistory = healthcareCostAtYear(input({ persons: [personWithinHorizon], historicalMagi: { '2026': 120000 } }), assumptions, 2028);
    expect(withHistory.people[0]).toMatchObject({ magiLookbackYear: 2026, magiUsed: 120000, partBMonthly: 284.1, partDMonthly: 14.5, magiSource: 'SUPPLIED' });

    const missingHistory = healthcareCostAtYear(input({ persons: [personWithinHorizon] }), assumptions, 2028);
    expect(missingHistory.people[0]).toMatchObject({ magiLookbackYear: 2026, magiUsed: null, partBMonthly: 202.9, partDMonthly: 0, magiSource: 'UNAVAILABLE' });
    expect(missingHistory.warnings.join(' ')).toContain('No supplied MAGI for 2026');
  });

  it('does not double-count Part D and excludes blended supplemental coverage from HSA premium coverage', () => {
    const annual = healthcareCostAtYear(input(), assumptions, 2026);
    expect(annual.people[0]).toMatchObject({ annual: 7934.8, hsaEligiblePremiumAnnual: 2434.8 });

    const result = calculateHealthcare(input({
      accounts: [{ owner: 'PRIMARY', type: 'HSA', balance: 10000, costBasis: null, annuityQualification: null, hsaQualified: true }],
    }), assumptions);
    expect(result.hsaCoverageYears).toBe(4.11);
    expect(result.warnings.join(' ')).toContain('Medigap premiums are not qualified HSA expenses');
  });

  it('flags an unknown under-65 coverage arrangement rather than representing an assumption as coverage', () => {
    const beforeMedicare = healthcareCostAtYear(input({
      persons: [{ ...input().persons[0], dob: '1970-06-15', planningAge: 90 }],
      currentHealthCoverage: null,
    }), assumptions, 2026);
    expect(beforeMedicare.people[0]).toMatchObject({ coverage: 'PRE_MEDICARE', annual: 10800 });
    expect(beforeMedicare.warnings.join(' ')).toContain('coverage before Medicare is unknown');
  });
});
