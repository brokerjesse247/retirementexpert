import { describe, expect, it } from 'vitest';
import { calculateEstateAndInsurance } from '../../lib/calculations/estate';
import type { PlanningAssumptions, PlanningInput } from '../../lib/calculations/types';

function planningInput(): PlanningInput {
  return {
    asOfDate: '2026-10-20',
    clientName: 'Alex and Jordan Morgan',
    filingStatus: 'MARRIED_FILING_JOINTLY',
    maritalStatus: 'MARRIED',
    state: 'CA',
    persons: [
      {
        role: 'PRIMARY', name: 'Alex Morgan', dob: '1965-06-15', ageMonths: 736, retirementAgeMonths: 804, planningAge: 95,
        earnedIncomeAnnual: 100_000, employeeContributionRate: 0, employerMatchRate: 0, combinedIraContributionAnnual: 0, iraContributionDestination: null,
        piaMonthly: 2_500, claimAgeMonths: null, alreadyReceiving: false, currentBenefitMonthly: null, benefitStartAgeMonths: null,
        pensionMonthly: 0, pensionStartAgeMonths: null, pensionSurvivorRate: null, pensionCola: null,
        annuityMonthly: 0, annuityStartAgeMonths: null, annuityQualification: null, rentalOtherMonthly: 0, rentalEndAgeMonths: null,
        partTimeAnnual: 0, partTimeEndAgeMonths: null, healthStatus: 'GOOD', lifeInsuranceDeathBenefit: 100_000, lifeInsuranceType: 'TERM', governmentNoncoveredPension: false,
      },
      {
        role: 'SPOUSE', name: 'Jordan Morgan', dob: '1967-09-20', ageMonths: 709, retirementAgeMonths: 804, planningAge: 95,
        earnedIncomeAnnual: 70_000, employeeContributionRate: 0, employerMatchRate: 0, combinedIraContributionAnnual: 0, iraContributionDestination: null,
        piaMonthly: 1_500, claimAgeMonths: null, alreadyReceiving: false, currentBenefitMonthly: null, benefitStartAgeMonths: null,
        pensionMonthly: 0, pensionStartAgeMonths: null, pensionSurvivorRate: null, pensionCola: null,
        annuityMonthly: 0, annuityStartAgeMonths: null, annuityQualification: null, rentalOtherMonthly: 0, rentalEndAgeMonths: null,
        partTimeAnnual: 0, partTimeEndAgeMonths: null, healthStatus: 'GOOD', lifeInsuranceDeathBenefit: 0, lifeInsuranceType: null, governmentNoncoveredPension: false,
      },
    ],
    accounts: [
      { owner: 'PRIMARY', type: 'CASH', balance: 50_000, costBasis: null, annuityQualification: null, hsaQualified: null },
      { owner: 'PRIMARY', type: 'BROKERAGE', balance: 70_000, costBasis: 50_000, annuityQualification: null, hsaQualified: null },
      { owner: 'PRIMARY', type: 'ROTH_IRA', balance: 50_000, costBasis: null, annuityQualification: null, hsaQualified: null },
      { owner: 'SPOUSE', type: 'HSA', balance: 10_000, costBasis: null, annuityQualification: null, hsaQualified: true },
    ],
    currentMonthlySpending: 9_000,
    retirementMonthlySpending: 8_000,
    essentialMonthlySpending: null,
    discretionaryMonthlySpending: null,
    healthcareIncludedInSpending: false,
    homeValue: 600_000,
    mortgageBalance: 300_000,
    mortgageMonthlyPayment: 2_000,
    mortgagePayoffYear: 2040,
    debts: [
      { name: 'Car loan', balance: 20_000, rate: 0.06, monthlyPayment: 400 },
      { name: 'Mortgage duplicate from imported debt list', balance: 300_000, rate: 0.04, monthlyPayment: 2_000 },
    ],
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
      will: { status: 'YES', updatedYear: 2024 },
      livingTrust: { status: 'NO', updatedYear: null },
      financialPoa: { status: 'YES', updatedYear: 2024 },
      healthcareDirective: { status: 'YES', updatedYear: 2024 },
      updatedBeneficiaries: { status: 'YES', updatedYear: 2023 },
    },
    historicalMagi: {},
    spouseLivedTogetherForMfs: false,
    warnings: [],
  };
}

function planningAssumptions(stateEstateThreshold: number | null = 400_000): PlanningAssumptions {
  return {
    survivorSpendingPercent: 0.75,
    incomeReplacementYears: 10,
    finalExpenses: 15_000,
    stateEstateThreshold,
    sources: [],
    annual: { estateExemption: 1_000_000, sources: [] },
  } as unknown as PlanningAssumptions;
}

describe('calculateEstateAndInsurance', () => {
  it('calculates a cent-rounded DIME gap, subtracting liquid assets and coverage while counting the mortgage only once', () => {
    const result = calculateEstateAndInsurance(planningInput(), planningAssumptions(), 2_000);

    // $300k mortgage + $20k other debt + (($6k survivor budget - $2k income) × 12 × 10) + $15k
    // − ($50k cash + $70k brokerage) − $100k existing life coverage.
    expect(result.insuranceNeed).toBe(595_000);
    expect(result.survivorIncomeGapMonthly).toBe(4_000);
    expect(result.insuranceNeedDetails).toMatchObject({
      mortgage: 300_000,
      otherDebts: 20_000,
      survivorBudgetMonthly: 6_000,
      survivorIncomeMonthly: 2_000,
      survivorIncomeReplacement: 480_000,
      liquidAssetsUsed: 120_000,
      existingLifeCoverage: 100_000,
      grossNeed: 815_000,
    });
    expect(result.status).toBe('COMPLETE');
    expect(result.warnings).toContain('Debt rows labelled as a mortgage were excluded because the separate mortgage balance is already included once.');
    expect(result.warnings.some((warning) => warning.includes('Retirement, HSA, annuity'))).toBe(true);
  });

  it('marks the result partial and uses an explicit bounded estimate when caller survivor income is unavailable', () => {
    const result = calculateEstateAndInsurance(planningInput(), planningAssumptions());

    expect(result.status).toBe('PARTIAL');
    expect(result.insuranceNeedDetails.survivorIncomeMonthly).toBeNull();
    expect(result.survivorIncomeGapMonthly).toBe(6_000);
    expect(result.warnings).toContain('Actual survivor income was not supplied; the insurance gap conservatively assumes $0 of monthly survivor income.');
    expect(result.warnings.some((warning) => warning.includes('not a carrier illustration'))).toBe(true);
  });

  it('applies the more-than-three-years beneficiary criterion using the supplied as-of year only', () => {
    const input = planningInput();
    const current = calculateEstateAndInsurance(input, planningAssumptions(), 2_000);
    expect(current.beneficiaryReviewDue).toBe(false); // 2026 − 2023 is exactly three years.

    input.estate.updatedBeneficiaries.updatedYear = 2022;
    const overdue = calculateEstateAndInsurance(input, planningAssumptions(), 2_000);
    expect(overdue.beneficiaryReviewDue).toBe(true);
    expect(overdue.checklist.find((item) => item.key === 'beneficiaryDesignations')).toMatchObject({ status: 'REVIEW_DUE' });

    input.asOfDate = 'not-a-date';
    const unknown = calculateEstateAndInsurance(input, planningAssumptions(), 2_000);
    expect(unknown.status).toBe('PARTIAL');
    expect(unknown.beneficiaryReviewDue).toBeNull();
  });

  it('does not invent a state threshold and makes only supplied-threshold estate comparisons', () => {
    const result = calculateEstateAndInsurance(planningInput(), planningAssumptions(null), 2_000);

    expect(result.estateTaxFlag).toMatchObject({
      status: 'BELOW_REPORTED_THRESHOLD',
      estimatedEstate: 460_000,
      threshold: 1_000_000,
    });
    expect(result.stateEstateTaxFlag).toMatchObject({ status: 'UNKNOWN', estimatedEstate: 460_000, threshold: null });
    expect(result.status).toBe('PARTIAL');
    expect(result.warnings.some((warning) => warning.includes('no state exemption was invented'))).toBe(true);
  });

  it('labels the $500k trust threshold as an educational heuristic, never a legal conclusion', () => {
    const input = planningInput();
    input.homeValue = 750_000;
    const result = calculateEstateAndInsurance(input, planningAssumptions(), 2_000);
    const trust = result.checklist.find((item) => item.key === 'livingTrust');

    expect(trust).toMatchObject({ status: 'MISSING' });
    expect(trust?.detail).toContain('educational discussion heuristic');
    expect(trust?.detail).toContain('does not establish that a trust is legally needed');
    expect(result.warnings.some((warning) => warning.includes('does not imply that probate is avoided'))).toBe(true);
  });
});
