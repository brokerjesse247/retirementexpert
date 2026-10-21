import { describe, expect, it } from 'vitest';
import { calculateLongTermCare, type LongTermCareEngineDependencies } from '../../lib/calculations/ltc';
import { roundMoney } from '../../lib/calculations/math';
import type { PlanningAssumptions, PlanningInput, PlanningPerson } from '../../lib/calculations/types';

function primary(overrides: Partial<PlanningPerson> = {}): PlanningPerson {
  return {
    role: 'PRIMARY', name: 'Avery Example', dob: '1980-12-30', ageMonths: 540, retirementAgeMonths: 804, planningAge: 95,
    earnedIncomeAnnual: 0, employeeContributionRate: 0, employerMatchRate: 0, combinedIraContributionAnnual: 0, iraContributionDestination: null,
    piaMonthly: 0, claimAgeMonths: null, alreadyReceiving: false, currentBenefitMonthly: null, benefitStartAgeMonths: null,
    pensionMonthly: 0, pensionStartAgeMonths: null, pensionSurvivorRate: null, pensionCola: null,
    annuityMonthly: 0, annuityStartAgeMonths: null, annuityQualification: null, rentalOtherMonthly: 0, rentalEndAgeMonths: null,
    partTimeAnnual: 0, partTimeEndAgeMonths: null, healthStatus: null, lifeInsuranceDeathBenefit: 0, lifeInsuranceType: null,
    governmentNoncoveredPension: false,
    ...overrides,
  };
}

function input(overrides: Partial<PlanningInput> = {}): PlanningInput {
  return {
    asOfDate: '2026-01-01', clientName: 'Avery Example', filingStatus: 'SINGLE', maritalStatus: 'SINGLE', state: 'CA',
    persons: [primary()], accounts: [], currentMonthlySpending: 4_000, retirementMonthlySpending: 4_000,
    essentialMonthlySpending: null, discretionaryMonthlySpending: null, healthcareIncludedInSpending: false,
    homeValue: 0, mortgageBalance: 0, mortgageMonthlyPayment: 0, mortgagePayoffYear: null, debts: [], goals: [],
    riskProfile: 'MODERATE', riskScore: 15, allocation: null, familyLongevity: null, currentHealthCoverage: null,
    ltcInsured: false, ltcDailyBenefit: null, disabilityInsured: null, legacyGoal: 0, annualCharity: 0,
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

function assumptions(overrides: Partial<PlanningAssumptions> = {}): PlanningAssumptions {
  return {
    year: 2026, version: 'test', annual: {} as PlanningAssumptions['annual'], inflation: 0.025, healthcareInflation: 0.05,
    socialSecurityCola: 0.025, returnByRisk: { CONSERVATIVE: 0.05, MODERATE: 0.065, AGGRESSIVE: 0.075 },
    volatilityByRisk: { CONSERVATIVE: 0.07, MODERATE: 0.11, AGGRESSIVE: 0.15 },
    planningAgeDefault: 95, planningAgeExcellentLongevity: 100, planningAgePoorHealth: 90, monteCarloRuns: 5_000,
    monteCarloSeed: 42, monteCarloTarget: 85, preMedicareMonthly: 900, supplementalMedicareMonthly: 250,
    medicalOutOfPocketAnnual: 2_500, ltcMonthly: 9_000, ltcYears: 3, ltcEventAge: 82, stateTaxRate: null,
    stateEstateThreshold: null, taxBracketInflation: 0.025, futureRulePolicy: 'PROJECT_CURRENT_RULES', targetTaxBracket: 0.22,
    heirsTaxRate: 0.24, realDiscountRate: 0.03, targetEquity: { CONSERVATIVE: 0.35, MODERATE: 0.55, AGGRESSIVE: 0.75 },
    finalExpenses: 15_000, survivorSpendingPercent: 0.75, incomeReplacementYears: 10, sources: [],
    ...overrides,
  };
}

describe('calculateLongTermCare', () => {
  it('uses the primary person’s calendar age-85 year and the supplied health inflation rate', () => {
    const planInput = input({ persons: [primary({ dob: '1970-06-15' })] });
    const planAssumptions = assumptions();

    const result = calculateLongTermCare(planInput, planAssumptions);

    expect(result.eventYear).toBe(2052);
    expect(result.costAt85).toBe(roundMoney(9_000 * 12 * 3 * Math.pow(1.05, 2055 - 2026)));
    expect(result.baseLegacy).toBeNull();
    expect(result.meta.warnings).toContain('Cash-flow and Monte Carlo engines were not supplied; no legacy or probability change was estimated.');
  });

  it('uses the primary birthday calendar years and actual engine outputs for the comparison', () => {
    let stressExtras: Record<string, number> | undefined;
    const engines: LongTermCareEngineDependencies = {
      calculateCashFlow: (_input, _assumptions, options) => {
        if (options?.extraExpenses) {
          stressExtras = options.extraExpenses;
          return { endingLegacy: 765_432.10, portfolioAtRetirement: 900_000, rows: [{ age: 67, portfolioWithdrawal: 63_000 }] };
        }
        return { endingLegacy: 1_000_000, portfolioAtRetirement: 900_000, rows: [{ age: 67, portfolioWithdrawal: 42_000 }] };
      },
      calculateMonteCarlo: (simulation) => ({ successPercent: simulation.annualWithdrawals[0] === 42_000 ? 91 : 66 }),
    };

    const result = calculateLongTermCare(input(), assumptions(), engines);

    expect(result.eventYear).toBe(2062); // 1980-12-30 + 82, not a current-age approximation.
    expect(Object.keys(stressExtras ?? {})).toEqual(['2062', '2063', '2064', '2065']);
    expect(roundMoney(Object.values(stressExtras ?? {}).reduce((total, amount) => total + amount, 0))).toBe(result.coverageGap);
    expect(result).toMatchObject({
      baseLegacy: 1_000_000,
      stressLegacy: 765_432.10,
      legacyChange: -234_567.90,
      baseSuccessPercent: 91,
      stressSuccessPercent: 66,
      successPercentChange: -25,
    });
  });

  it('keeps unknown coverage distinct from known zero and does not run a zero-coverage stress by assumption', () => {
    let cashFlowCalls = 0;
    const engines: LongTermCareEngineDependencies = {
      calculateCashFlow: () => {
        cashFlowCalls += 1;
        return { endingLegacy: 0, portfolioAtRetirement: 1, rows: [{ age: 65, portfolioWithdrawal: 0 }] };
      },
      calculateMonteCarlo: () => ({ successPercent: 0 }),
    };

    const result = calculateLongTermCare(input({ ltcInsured: null }), assumptions(), engines);

    expect(result.existingCoverage).toBeNull();
    expect(result.coverageGap).toBeNull();
    expect(result.stressLegacy).toBeNull();
    expect(cashFlowCalls).toBe(0);
    expect(result.meta.warnings).toContain('LTC coverage status is unknown; coverage and coverage gap are intentionally not shown as $0.');
  });

  it('caps coverage at the care expense, treats the supplied daily benefit as level, and does not mutate input', () => {
    const planInput = input({ ltcInsured: true, ltcDailyBenefit: 100 });
    const before = structuredClone(planInput);

    const result = calculateLongTermCare(planInput, assumptions());

    expect(result.existingCoverage).toBeGreaterThan(0);
    expect(result.existingCoverage).toBeLessThan(result.eventCost);
    expect(result.coverageGap).toBe(roundMoney(result.eventCost - (result.existingCoverage ?? 0)));
    expect(result.meta.status).toBe('PARTIAL');
    expect(result.meta.warnings).toContain('The supplied LTC daily benefit is treated as level; no inflation rider was provided.');
    expect(result.meta.warnings.some((warning) => warning.includes('Policy benefit duration'))).toBe(true);
    expect(planInput).toEqual(before);
  });
});
