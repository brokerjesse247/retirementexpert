import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnualRules, PlanningAssumptions, PlanningInput } from '../../lib/calculations/types';

const mocks = vi.hoisted(() => ({
  cashFlow: vi.fn(),
  projectAnnualRules: vi.fn((rules: unknown) => rules),
}));

vi.mock('../../lib/calculations/cash-flow', () => ({ calculateCashFlow: mocks.cashFlow }));
vi.mock('../../lib/assumptions/defaults', () => ({ projectAnnualRules: mocks.projectAnnualRules }));

import { calculateRothConversions, taxableIncomeFromCashFlowMagi } from '../../lib/calculations/roth';

const rules: AnnualRules = {
  year: 2030,
  taxBrackets: {
    SINGLE: [{ upTo: 50_000, rate: 0.1 }, { upTo: 100_000, rate: 0.22 }, { upTo: null, rate: 0.24 }],
    MARRIED_FILING_JOINTLY: [{ upTo: 100_000, rate: 0.1 }, { upTo: 200_000, rate: 0.22 }, { upTo: null, rate: 0.24 }],
    MARRIED_FILING_SEPARATELY: [{ upTo: 50_000, rate: 0.1 }, { upTo: 100_000, rate: 0.22 }, { upTo: null, rate: 0.24 }],
    HEAD_OF_HOUSEHOLD: [{ upTo: 75_000, rate: 0.1 }, { upTo: 125_000, rate: 0.22 }, { upTo: null, rate: 0.24 }],
  },
  standardDeduction: { SINGLE: 20_000, MARRIED_FILING_JOINTLY: 40_000, MARRIED_FILING_SEPARATELY: 20_000, HEAD_OF_HOUSEHOLD: 30_000 },
  additionalDeduction65: { SINGLE: 1_500, MARRIED_FILING_JOINTLY: 1_500, MARRIED_FILING_SEPARATELY: 1_500, HEAD_OF_HOUSEHOLD: 1_500 },
  seniorDeduction: { amount: 6_000, phaseoutStart: { SINGLE: 100_000, MARRIED_FILING_JOINTLY: 200_000, MARRIED_FILING_SEPARATELY: 100_000, HEAD_OF_HOUSEHOLD: 150_000 }, phaseoutRate: 0.0006, endYear: 2038, eligibleFilingStatuses: ['SINGLE', 'MARRIED_FILING_JOINTLY', 'MARRIED_FILING_SEPARATELY', 'HEAD_OF_HOUSEHOLD'] },
  capitalGainsThresholds: { SINGLE: { zero: 1, fifteen: 2 }, MARRIED_FILING_JOINTLY: { zero: 1, fifteen: 2 }, MARRIED_FILING_SEPARATELY: { zero: 1, fifteen: 2 }, HEAD_OF_HOUSEHOLD: { zero: 1, fifteen: 2 } },
  contributions: { workplace: 1, workplaceCatchup50: 1, workplaceCatchup60to63: 1, ira: 1, iraCatchup50: 1, hsaSelf: 1, hsaFamily: 1, hsaCatchup55: 1 },
  socialSecurity: { earningsUnderFra: 1, earningsFraYear: 1, taxableMaximum: 1, cola: 0, taxThresholds: { SINGLE: { base1: 1, base2: 2, cap: 3 }, MARRIED_FILING_JOINTLY: { base1: 1, base2: 2, cap: 3 }, MARRIED_FILING_SEPARATELY: { base1: 1, base2: 2, cap: 3 }, HEAD_OF_HOUSEHOLD: { base1: 1, base2: 2, cap: 3 } } },
  medicare: {
    partBStandard: 200,
    irmaaSingle: [{ upTo: 110_000, partBMonthly: 200, partDMonthly: 0 }, { upTo: null, partBMonthly: 300, partDMonthly: 50 }],
    irmaaJoint: [{ upTo: 220_000, partBMonthly: 200, partDMonthly: 0 }, { upTo: null, partBMonthly: 300, partDMonthly: 50 }],
    irmaaSeparate: [{ upTo: 110_000, partBMonthly: 200, partDMonthly: 0 }, { upTo: null, partBMonthly: 300, partDMonthly: 50 }],
  },
  rmdUniform: {}, estateExemption: 1, giftExclusion: 1, qcdLimit: 1, sources: [{ key: 'tax', url: 'https://example.invalid/annual', title: 'Test annual rules', verifiedAt: '2030-01-01', classification: 'OFFICIAL' }],
};

const assumptions: PlanningAssumptions = {
  year: 2030, version: 'test', annual: rules, inflation: 0.02, healthcareInflation: 0.04, socialSecurityCola: 0.02,
  returnByRisk: { CONSERVATIVE: 0.04, MODERATE: 0.05, AGGRESSIVE: 0.06 }, volatilityByRisk: { CONSERVATIVE: 0.01, MODERATE: 0.1, AGGRESSIVE: 0.15 },
  planningAgeDefault: 90, planningAgeExcellentLongevity: 95, planningAgePoorHealth: 85, monteCarloRuns: 5_000, monteCarloSeed: 42, monteCarloTarget: 0.85,
  preMedicareMonthly: 1, supplementalMedicareMonthly: 1, medicalOutOfPocketAnnual: 1, ltcMonthly: 1, ltcYears: 1, ltcEventAge: 85,
  stateTaxRate: null, stateEstateThreshold: null, taxBracketInflation: 0.02, futureRulePolicy: 'PROJECT_CURRENT_RULES', targetTaxBracket: 0.22, heirsTaxRate: 0.24,
  realDiscountRate: 0.03, targetEquity: { CONSERVATIVE: 0.35, MODERATE: 0.55, AGGRESSIVE: 0.75 }, finalExpenses: 1, survivorSpendingPercent: 0.75, incomeReplacementYears: 5,
  sources: [],
};

const input: PlanningInput = {
  asOfDate: '2030-01-01', clientName: 'Test Client', filingStatus: 'SINGLE', maritalStatus: 'SINGLE', state: 'CA',
  persons: [{ role: 'PRIMARY', name: 'Test Client', dob: '1968-01-01', ageMonths: 744, retirementAgeMonths: 744, planningAge: 90, earnedIncomeAnnual: 0, employeeContributionRate: 0, employerMatchRate: 0, combinedIraContributionAnnual: 0, iraContributionDestination: null, piaMonthly: 1_000, claimAgeMonths: 64 * 12, alreadyReceiving: false, currentBenefitMonthly: null, benefitStartAgeMonths: null, pensionMonthly: 0, pensionStartAgeMonths: null, pensionSurvivorRate: null, pensionCola: null, annuityMonthly: 0, annuityStartAgeMonths: null, annuityQualification: null, rentalOtherMonthly: 0, rentalEndAgeMonths: null, partTimeAnnual: 0, partTimeEndAgeMonths: null, healthStatus: null, lifeInsuranceDeathBenefit: 0, lifeInsuranceType: null, governmentNoncoveredPension: false }],
  accounts: [{ owner: 'PRIMARY', type: 'TRAD_IRA', balance: 100_000, costBasis: null, annuityQualification: null, hsaQualified: null }],
  currentMonthlySpending: 1, retirementMonthlySpending: 1, essentialMonthlySpending: null, discretionaryMonthlySpending: null, healthcareIncludedInSpending: false,
  homeValue: 0, mortgageBalance: 0, mortgageMonthlyPayment: 0, mortgagePayoffYear: null, debts: [], goals: [], riskProfile: 'MODERATE', riskScore: 15, allocation: null,
  familyLongevity: null, currentHealthCoverage: null, ltcInsured: null, ltcDailyBenefit: null, disabilityInsured: null, legacyGoal: 0, annualCharity: 0, dependents: 0, dependentsSpecialNeeds: false,
  estate: { will: { status: 'UNSURE', updatedYear: null }, livingTrust: { status: 'UNSURE', updatedYear: null }, financialPoa: { status: 'UNSURE', updatedYear: null }, healthcareDirective: { status: 'UNSURE', updatedYear: null }, updatedBeneficiaries: { status: 'UNSURE', updatedYear: null } },
  historicalMagi: {}, spouseLivedTogetherForMfs: false, warnings: [],
};

const baseRows = [
  { year: 2030, age: 62, socialSecurity: 0, federalTax: 3_000, rmd: 0, rothConversion: 0, endingBalance: 200_000, taxDeferredBalance: 100_000, rothBalance: 0, hsaBalance: 0, magi: 50_000 },
  { year: 2031, age: 63, socialSecurity: 0, federalTax: 3_200, rmd: 0, rothConversion: 0, endingBalance: 190_000, taxDeferredBalance: 95_000, rothBalance: 0, hsaBalance: 0, magi: 52_000 },
  { year: 2032, age: 64, socialSecurity: 12_000, federalTax: 3_400, rmd: 0, rothConversion: 0, endingBalance: 180_000, taxDeferredBalance: 70_000, rothBalance: 0, hsaBalance: 0, magi: 55_000 },
  { year: 2033, age: 65, socialSecurity: 12_000, federalTax: 3_600, rmd: 20_000, rothConversion: 0, endingBalance: 200_000, taxDeferredBalance: 50_000, rothBalance: 0, hsaBalance: 0, magi: 60_000 },
];

beforeEach(() => {
  mocks.cashFlow.mockReset();
  mocks.projectAnnualRules.mockClear();
  mocks.cashFlow.mockImplementation((_input: PlanningInput, _assumptions: PlanningAssumptions, options?: { rothConversions?: Record<string, number> }) => {
    const schedule = options?.rothConversions ?? {};
    const totalConversion = Object.values(schedule).reduce((sum, amount) => sum + amount, 0);
    const converted = totalConversion > 0;
    return {
      rows: baseRows.map((row) => {
        const conversion = schedule[String(row.year)] ?? 0;
        return {
          ...row,
          rothConversion: conversion,
          magi: row.magi + conversion,
          federalTax: row.federalTax + conversion * 0.22,
          taxDeferredBalance: Math.max(0, row.taxDeferredBalance - totalConversion),
          rmd: row.year === 2033 && converted ? 10_000 : row.rmd,
        };
      }),
      retirementYear: 2030, portfolioAtRetirement: 200_000, depletionAge: null,
      endingLegacy: converted ? 210_000 : 200_000,
      lifetimeFederalTax: converted ? 90_000 : 100_000,
    };
  });
});

describe('Roth conversion engine', () => {
  it('fills the configured bracket only in the retirement-to-SS/RMD window and reruns cash flow', () => {
    const result = calculateRothConversions(input, assumptions);
    expect(result.schedule.map((row) => [row.year, row.amount])).toEqual([[2030, 70_000], [2031, 30_000]]);
    expect(result.schedule.every((row) => row.year < 2032 && row.rmd === 0)).toBe(true);
    expect(result.noConversion.totalRmd).toBe(20_000);
    expect(result.withConversion.totalRmd).toBe(10_000);
    expect(result.lifetimeTaxDifference).toBe(10_000);
    expect(result.afterTaxLegacyDifference).toBe(22_000);
    expect(result.beneficial).toBe(true);
    expect(mocks.cashFlow.mock.calls.some((call) => call[2]?.rothConversions?.['2030'] === 70_000)).toBe(true);
  });

  it('caps an age-63 conversion one cent below the supplied IRMAA tier boundary', () => {
    mocks.cashFlow.mockImplementation((_input: PlanningInput, _assumptions: PlanningAssumptions, options?: { rothConversions?: Record<string, number> }) => {
      const schedule = options?.rothConversions ?? {};
      const totalConversion = Object.values(schedule).reduce((sum, amount) => sum + amount, 0);
      return {
        rows: baseRows.map((row) => {
          const conversion = schedule[String(row.year)] ?? 0;
          const baselineMagi = row.year === 2031 ? 105_000 : row.magi;
          return {
            ...row,
            rothConversion: conversion,
            magi: baselineMagi + conversion,
            federalTax: row.federalTax + conversion * 0.22,
            taxDeferredBalance: Math.max(0, row.taxDeferredBalance - totalConversion),
          };
        }),
        retirementYear: 2030, portfolioAtRetirement: 200_000, depletionAge: null,
        endingLegacy: 200_000, lifetimeFederalTax: 100_000,
      };
    });
    const result = calculateRothConversions({ ...input, accounts: [{ ...input.accounts[0], balance: 200_000 }] }, assumptions);
    const age63 = result.schedule.find((row) => row.year === 2031);
    expect(age63).toMatchObject({ amount: 4_999.99, magi: 109_999.99, irmaaCap: 109_999.99, irmaaCheck: 'WITHIN_CAP' });
  });

  it('uses annual additional and senior deductions when finding bracket room', () => {
    const olderInput: PlanningInput = { ...input, persons: [{ ...input.persons[0], dob: '1960-01-01', ageMonths: 840 }] };
    expect(taxableIncomeFromCashFlowMagi(olderInput, rules, 2030, 110_000)).toBe(82_506);
  });

  it('returns an empty, non-beneficial schedule if Social Security closes the permitted window', () => {
    mocks.cashFlow.mockImplementation(() => ({
      rows: baseRows.map((row) => ({ ...row, socialSecurity: 12_000 })), retirementYear: 2030, portfolioAtRetirement: 200_000,
      depletionAge: null, endingLegacy: 200_000, lifetimeFederalTax: 100_000,
    }));
    const result = calculateRothConversions(input, assumptions);
    expect(result.schedule).toEqual([]);
    expect(result.lifetimeTaxDifference).toBe(0);
    expect(result.afterTaxLegacyDifference).toBe(0);
    expect(result.beneficial).toBe(false);
    expect(result.warnings.join(' ')).toContain('No retirement-to-Social-Security/RMD');
  });
});
