import { describe, expect, it } from 'vitest';
import {
  breakEvenAge,
  calculateOwnBenefit,
  calculateSocialSecurity,
  calculateSpousalBenefit,
  getFullRetirementAgeMonths,
  householdBenefitsAtYear,
} from '../../lib/calculations/social-security';
import type { PlanningAssumptions, PlanningInput, PlanningPerson } from '../../lib/calculations/types';

const assumptions = {
  year: 2026,
  annual: {
    year: 2026,
    socialSecurity: { earningsUnderFra: 24_480, earningsFraYear: 65_160, taxableMaximum: 184_500, cola: 0 },
    sources: [],
  },
  realDiscountRate: 0.03,
  sources: [],
} as unknown as PlanningAssumptions;

function person(role: 'PRIMARY' | 'SPOUSE', overrides: Partial<PlanningPerson> = {}): PlanningPerson {
  return {
    role,
    name: role === 'PRIMARY' ? 'Primary' : 'Spouse',
    dob: role === 'PRIMARY' ? '1964-06-15' : '1965-07-15',
    ageMonths: 60 * 12,
    retirementAgeMonths: 75 * 12,
    planningAge: 95,
    earnedIncomeAnnual: 0,
    employeeContributionRate: 0,
    employerMatchRate: 0,
    combinedIraContributionAnnual: 0,
    iraContributionDestination: null,
    piaMonthly: 2_000,
    claimAgeMonths: 62 * 12,
    alreadyReceiving: false,
    currentBenefitMonthly: null,
    benefitStartAgeMonths: null,
    pensionMonthly: 0,
    pensionStartAgeMonths: null,
    pensionSurvivorRate: null,
    pensionCola: null,
    annuityMonthly: 0,
    annuityStartAgeMonths: null,
    annuityQualification: null,
    rentalOtherMonthly: 0,
    rentalEndAgeMonths: null,
    partTimeAnnual: 0,
    partTimeEndAgeMonths: null,
    healthStatus: null,
    lifeInsuranceDeathBenefit: 0,
    lifeInsuranceType: null,
    governmentNoncoveredPension: false,
    ...overrides,
  };
}

function input(persons: PlanningPerson[], overrides: Partial<PlanningInput> = {}): PlanningInput {
  return {
    asOfDate: '2026-01-15',
    clientName: 'Test household',
    filingStatus: persons.length === 2 ? 'MARRIED_FILING_JOINTLY' : 'SINGLE',
    maritalStatus: persons.length === 2 ? 'MARRIED' : 'SINGLE',
    state: 'CA',
    persons,
    accounts: [],
    currentMonthlySpending: 0,
    retirementMonthlySpending: 0,
    essentialMonthlySpending: null,
    discretionaryMonthlySpending: null,
    healthcareIncludedInSpending: false,
    homeValue: 0,
    mortgageBalance: 0,
    mortgageMonthlyPayment: 0,
    mortgagePayoffYear: null,
    debts: [],
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

describe('Social Security statutory age and benefit calculations', () => {
  it('uses the statutory FRA schedule and January 1 birth-year treatment', () => {
    expect(getFullRetirementAgeMonths(1954)).toBe(66 * 12);
    expect(getFullRetirementAgeMonths(1957)).toBe(66 * 12 + 6);
    expect(getFullRetirementAgeMonths(1960)).toBe(67 * 12);
    expect(getFullRetirementAgeMonths('1960-01-01')).toBe(66 * 12 + 10);
  });

  it('matches the required worker benefit acceptance values, including 54 months early', () => {
    expect(calculateOwnBenefit(2_000, 67 * 12, 62 * 12)).toBe(1_400);
    expect(calculateOwnBenefit(2_000, 67 * 12, 67 * 12)).toBe(2_000);
    expect(calculateOwnBenefit(2_000, 67 * 12, 70 * 12)).toBe(2_480);
    expect(calculateOwnBenefit(2_000, 67 * 12, 64 * 12)).toBe(1_600);
    expect(calculateOwnBenefit(2_000, 66 * 12 + 6, 62 * 12)).toBe(1_450);
  });

  it('computes the excess spouse component separately and requires worker filing', () => {
    expect(calculateSpousalBenefit({ workerPia: 2_000, ownPia: 600, spouseFraMonths: 67 * 12, spouseClaimMonths: 67 * 12 })).toBe(1_000);
    expect(calculateSpousalBenefit({ workerPia: 2_000, ownPia: 0, spouseFraMonths: 67 * 12, spouseClaimMonths: 62 * 12 })).toBe(650);
    expect(calculateSpousalBenefit({ workerPia: 2_000, ownPia: 600, spouseFraMonths: 67 * 12, spouseClaimMonths: 67 * 12, workerFiled: false })).toBe(600);
  });

  it('matches the specified simple no-COLA break-even ages', () => {
    expect(breakEvenAge(2_000, 67 * 12, 62 * 12, 67 * 12)).toBeCloseTo(78.67, 2);
    expect(breakEvenAge(2_000, 67 * 12, 67 * 12, 70 * 12)).toBeCloseTo(82.5, 2);
  });
});

describe('household Social Security timing and earnings test', () => {
  it('uses entitlement-month timing: a non-first birthday starts after the birthday month and a first-day birthday starts in it', () => {
    const ordinary = input([person('PRIMARY', { dob: '1964-06-15', piaMonthly: 2_000 })]);
    const firstDay = input([person('PRIMARY', { dob: '1964-06-01', piaMonthly: 2_000 })]);
    expect(householdBenefitsAtYear(ordinary, assumptions, 2026).annual).toBe(8_400);
    expect(householdBenefitsAtYear(firstDay, assumptions, 2026).annual).toBe(9_800);
  });

  it('uses supplied annual earnings limits and applies the under-FRA $1-for-$2 withholding', () => {
    const worker = input([person('PRIMARY', { dob: '1964-06-15', piaMonthly: 2_000, earnedIncomeAnnual: 30_000, retirementAgeMonths: 70 * 12 })]);
    const benefit = householdBenefitsAtYear(worker, assumptions, 2026);
    expect(benefit.withheld).toBe(2_760);
    expect(benefit.annual).toBe(5_640);
    expect(benefit.warnings).toContain('Primary: Social Security benefits are reduced for the annual earnings test; withheld payments are not a permanent benefit loss.');
    expect(benefit.warnings).toContain("Primary: SSA's first-year special monthly earnings rule is not modeled because monthly earnings and self-employment service hours are not supplied.");
  });

  it('uses only the months before FRA in the FRA-year withholding estimate', () => {
    const fraYearAssumptions = structuredClone(assumptions) as PlanningAssumptions;
    fraYearAssumptions.year = 2027;
    fraYearAssumptions.annual.year = 2027;
    const worker = input(
      [person('PRIMARY', { dob: '1960-12-15', piaMonthly: 2_000, earnedIncomeAnnual: 100_000, retirementAgeMonths: 70 * 12 })],
      { asOfDate: '2027-01-15' },
    );
    const benefit = householdBenefitsAtYear(worker, fraYearAssumptions, 2027);
    expect(benefit.withheld).toBe(8_835.56);
    expect(benefit.annual).toBe(7_964.44);
    expect(benefit.warnings.some((warning) => warning.includes('uniformly annualized across 11 month(s) before FRA'))).toBe(true);
  });
});

describe('Social Security survivor treatment', () => {
  it('uses the larger worker benefit after a modeled first death only in the supported simple case', () => {
    const primary = person('PRIMARY', {
      dob: '1950-06-15',
      planningAge: 77,
      alreadyReceiving: true,
      currentBenefitMonthly: 2_500,
      benefitStartAgeMonths: 70 * 12,
    });
    const spouse = person('SPOUSE', {
      dob: '1955-06-15',
      planningAge: 95,
      alreadyReceiving: true,
      currentBenefitMonthly: 1_800,
      benefitStartAgeMonths: 67 * 12,
    });
    const household = input([primary, spouse]);
    const result = calculateSocialSecurity(household, assumptions);

    expect(result.planned.survivorModel).toBe('SIMPLE_MAX_BENEFIT');
    expect(householdBenefitsAtYear(household, assumptions, 2028).annual).toBe(30_000);
  });
});

describe('Social Security optimizer', () => {
  it('returns all 81 annual-age pairs, uses a 3% real PV, and does not undo an already claimed benefit', () => {
    const primary = person('PRIMARY', {
      dob: '1950-06-15',
      piaMonthly: 2_000,
      alreadyReceiving: true,
      currentBenefitMonthly: 1_500,
      benefitStartAgeMonths: 62 * 12,
      planningAge: 95,
    });
    const spouse = person('SPOUSE', { dob: '1955-06-15', piaMonthly: 600, claimAgeMonths: 67 * 12, planningAge: 95 });
    const request = input([primary, spouse]);
    const before = structuredClone(request);
    const result = calculateSocialSecurity(request, assumptions);

    expect(result.curves.combinations).toHaveLength(81);
    expect(result.curves.combinations.every((combination) => combination.claimAgesMonths.PRIMARY === 62 * 12)).toBe(true);
    expect(result.best.presentValue).toBeGreaterThanOrEqual(result.planned.presentValue);
    expect(result.meta.warnings).toContain('Primary: benefit is already claimed and remains locked in all claiming alternatives.');
    expect(request).toStrictEqual(before);
  });
});
