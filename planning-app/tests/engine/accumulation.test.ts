import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS, projectAnnualRules } from '@/lib/assumptions/defaults';
import { calculateAccumulation } from '@/lib/calculations/accumulation';
import { roundMoney } from '@/lib/calculations/math';
import type { AnnualRules, PlanningAssumptions, PlanningInput, PlanningPerson } from '@/lib/calculations/types';

const annual: AnnualRules = structuredClone(DEFAULT_ASSUMPTIONS.annual);
annual.contributions = {
  ...annual.contributions,
  workplace: 20_000,
  workplaceCatchup50: 5_000,
  workplaceCatchup60to63: 10_000,
  ira: 6_000,
  iraCatchup50: 1_000,
};

const assumptions: PlanningAssumptions = {
  year: 2026,
  version: 'accumulation-test',
  annual,
  inflation: 0.025,
  healthcareInflation: 0.05,
  socialSecurityCola: 0.025,
  returnByRisk: { CONSERVATIVE: 0.1, MODERATE: 0.1, AGGRESSIVE: 0.1 },
  volatilityByRisk: { CONSERVATIVE: 0, MODERATE: 0, AGGRESSIVE: 0 },
  planningAgeDefault: 95,
  planningAgeExcellentLongevity: 100,
  planningAgePoorHealth: 90,
  monteCarloRuns: 5_000,
  monteCarloSeed: 42,
  monteCarloTarget: 0.85,
  preMedicareMonthly: 0,
  supplementalMedicareMonthly: 0,
  medicalOutOfPocketAnnual: 0,
  ltcMonthly: 0,
  ltcYears: 0,
  ltcEventAge: 82,
  stateTaxRate: null,
  stateEstateThreshold: null,
  taxBracketInflation: 0.025,
  futureRulePolicy: 'PROJECT_CURRENT_RULES',
  targetTaxBracket: 0.22,
  heirsTaxRate: 0.24,
  realDiscountRate: 0.03,
  targetEquity: { CONSERVATIVE: 0.35, MODERATE: 0.55, AGGRESSIVE: 0.75 },
  finalExpenses: 0,
  survivorSpendingPercent: 0.75,
  incomeReplacementYears: 10,
  sources: [],
};

function person(overrides: Partial<PlanningPerson> = {}): PlanningPerson {
  return {
    role: 'PRIMARY',
    name: 'Avery Example',
    dob: '1965-07-01',
    ageMonths: 726,
    retirementAgeMonths: 65 * 12,
    planningAge: 95,
    earnedIncomeAnnual: 200_000,
    employeeContributionRate: 0.3,
    employerMatchRate: 0.05,
    combinedIraContributionAnnual: 15_000,
    iraContributionDestination: 'ROTH_IRA',
    piaMonthly: 0,
    claimAgeMonths: null,
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

function input(overrides: Partial<PlanningInput> = {}): PlanningInput {
  return {
    asOfDate: '2026-01-01',
    clientName: 'Avery Example',
    filingStatus: 'SINGLE',
    maritalStatus: 'SINGLE',
    state: 'CA',
    persons: [person()],
    accounts: [
      { owner: 'PRIMARY', type: 'K401_PRETAX', balance: 100_000, costBasis: null, annuityQualification: null, hsaQualified: null },
      { owner: 'PRIMARY', type: 'ROTH_401K', balance: 10_000, costBasis: null, annuityQualification: null, hsaQualified: null },
    ],
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

describe('calculateAccumulation', () => {
  it('uses the higher age-60-to-63 workplace catch-up, caps IRA contributions, and applies employer match once', () => {
    const result = calculateAccumulation(input(), assumptions);
    const row = result.rows[0];

    expect(row.contributionDetails.PRIMARY).toMatchObject({
      salary: 200_000,
      workplaceEmployeeLimit: 30_000,
      employeeWorkplace: 30_000,
      employerMatch: 10_000,
      iraLimit: 7_000,
      ira: 7_000,
      total: 47_000,
      working: true,
    });
    expect(row.contributions).toBe(47_000);
    expect(row.buckets.taxDeferred).toBe(150_000);
    expect(row.buckets.roth).toBe(18_000);
    expect(row.buckets.taxFree).toBe(18_000);
    expect(result.warnings).toContain('Avery Example: employee workplace contribution is capped at the 2026 annual limit of $30000.00.');
    expect(result.warnings).toContain('Avery Example: IRA/Roth contribution is capped at the 2026 annual limit of $7000.00.');
  });

  it('stops a retired owner’s wage-based contributions while the other owner continues contributing', () => {
    const primary = person({
      dob: '1955-01-01',
      ageMonths: 71 * 12,
      retirementAgeMonths: 65 * 12,
      earnedIncomeAnnual: 100_000,
      employeeContributionRate: 0.1,
      employerMatchRate: 0.05,
      combinedIraContributionAnnual: 0,
    });
    const spouse = person({
      role: 'SPOUSE',
      name: 'Blair Example',
      dob: '1975-01-01',
      ageMonths: 51 * 12,
      retirementAgeMonths: 55 * 12,
      earnedIncomeAnnual: 100_000,
      employeeContributionRate: 0.1,
      employerMatchRate: 0.05,
      combinedIraContributionAnnual: 0,
      iraContributionDestination: null,
    });
    const result = calculateAccumulation(input({
      clientName: 'Avery & Blair Example',
      persons: [primary, spouse],
      accounts: [
        { owner: 'PRIMARY', type: 'K401_PRETAX', balance: 100_000, costBasis: null, annuityQualification: null, hsaQualified: null },
        { owner: 'SPOUSE', type: 'K401_PRETAX', balance: 100_000, costBasis: null, annuityQualification: null, hsaQualified: null },
      ],
    }), assumptions);

    const firstYear = result.rows[0];
    expect(firstYear.contributionDetails.PRIMARY).toMatchObject({ working: false, total: 0 });
    expect(firstYear.contributionDetails.SPOUSE).toMatchObject({ working: true, employeeWorkplace: 10_000, employerMatch: 5_000, total: 15_000 });
    expect(firstYear.contributions).toBe(15_000);
    expect(result.endingAccounts.find((account) => account.owner === 'PRIMARY' && account.type === 'K401_PRETAX')?.balance).toBeGreaterThan(110_000);
  });

  it('does not fabricate a combined IRA/Roth destination', () => {
    const result = calculateAccumulation(input({
      persons: [person({
        employeeContributionRate: 0,
        employerMatchRate: 0,
        combinedIraContributionAnnual: 7_000,
        iraContributionDestination: null,
      })],
      accounts: [{ owner: 'PRIMARY', type: 'CASH', balance: 1_000, costBasis: null, annuityQualification: null, hsaQualified: null }],
    }), assumptions);

    expect(result.status).toBe('PARTIAL');
    expect(result.rows[0].contributionDetails.PRIMARY?.ira).toBe(0);
    expect(result.endingAccounts.some((account) => account.type === 'TRAD_IRA' || account.type === 'ROTH_IRA')).toBe(false);
    expect(result.warnings).toContain('Avery Example: combined IRA/Roth contribution is not modeled because its destination is unknown.');
  });

  it('uses the supplied projected annual rules for later contribution years', () => {
    const laterYear = 2027;
    const result = calculateAccumulation(input({
      persons: [person({ retirementAgeMonths: 65 * 12, combinedIraContributionAnnual: 0 })],
    }), assumptions);
    const projected = projectAnnualRules(annual, laterYear, assumptions.inflation);
    const projectedRow = result.rows.find((row) => row.year === laterYear);
    const expectedLimit = roundMoney(
      projected.contributions.workplace
      + (projectedRow!.ages.PRIMARY! >= 60 && projectedRow!.ages.PRIMARY! <= 63
        ? projected.contributions.workplaceCatchup60to63
        : projectedRow!.ages.PRIMARY! >= 50
          ? projected.contributions.workplaceCatchup50
          : 0),
    );

    expect(projectedRow?.contributionDetails.PRIMARY?.workplaceEmployeeLimit).toBe(expectedLimit);
  });
});
