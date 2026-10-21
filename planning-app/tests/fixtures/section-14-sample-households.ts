import { DEFAULT_ASSUMPTIONS } from '../../lib/assumptions/defaults';
import { mapPlanningInput } from '../../lib/calculations/input';
import type { AnalysisOverrides } from '../../lib/calculations/input';
import type { PlanningInput } from '../../lib/calculations/types';
import { emptyIntake, type IntakeData } from '../../lib/intake/schema';

/**
 * These are synthetic test submissions derived from TODO.md, original Section
 * 14.2. They are not persistence seeds and must never be written to Preview or
 * any database. Values described as synthetic below only make the intake shape
 * executable; they are not asserted as client facts.
 */
export const SECTION_14_SAMPLE_AS_OF_DATE = '2026-01-15';

export type SampleHouseholdFixture = Readonly<{
  label: 'SYNTHETIC';
  source: 'TODO.md original Section 14.2';
  household: string;
  /** Facts omitted by Section 14.2 and deliberately retained as unknown. */
  unknownAnswers: readonly string[];
  /** Synthetic schema-only supplements or explicit illustration conventions. */
  supplements: readonly string[];
  raw: IntakeData;
  /** Explicit analysis settings only; no missing fact is silently supplied. */
  illustrationOverrides: AnalysisOverrides;
  planningInput: PlanningInput;
}>;

function syntheticBase(): IntakeData {
  return structuredClone(emptyIntake);
}

function map(raw: IntakeData, illustrationOverrides: AnalysisOverrides): PlanningInput {
  return mapPlanningInput(raw, DEFAULT_ASSUMPTIONS, SECTION_14_SAMPLE_AS_OF_DATE, illustrationOverrides);
}

const jamesLindaRaw = syntheticBase();
Object.assign(jamesLindaRaw, {
  firstName: 'James',
  lastName: 'Mitchell',
  email: 'james.mitchell@example.invalid',
  phone: '555-010-1458',
  // Synthetic date anchors make the supplied ages 58 and 56 as of 2026-01-15.
  dob: '1967-06-15',
  state: 'CA',
  maritalStatus: 'MARRIED',
  filingStatus: 'MARRIED_FILING_JOINTLY',
  dependents: '0',
  rankedConcerns: ['RUNNING_OUT_OF_MONEY', 'TAXES', 'HEALTHCARE'],
  // A neutral, schema-required proxy for the supplied “moderate risk” label.
  riskAnswers: [3, 3, 3, 3, 3],
  consent: true,
  allocation: { status: 'NOT_SURE', stocksPercent: '', bondsPercent: '', cashPercent: '' },
  expenses: { currentMonthly: '7500', retirementMonthly: '6500', essentialMonthly: '', discretionaryMonthly: '' },
  home: { value: '450000', mortgageBalance: '110000', monthlyPayment: '', payoffYear: '' },
  health: {
    familyLongevity: '',
    currentCoverage: '',
    preMedicarePlan: '',
    longTermCareInsurance: 'NO',
    longTermCareDailyBenefit: '',
    disabilityInsurance: '',
  },
  estate: {
    will: { status: 'YES', updatedYear: '' },
    livingTrust: { status: 'NO', updatedYear: '' },
    financialPoa: { status: 'UNSURE', updatedYear: '' },
    healthcareDirective: { status: 'UNSURE', updatedYear: '' },
    updatedBeneficiaries: { status: 'UNSURE', updatedYear: '' },
  },
});
Object.assign(jamesLindaRaw.primary, {
  firstName: 'James',
  lastName: 'Mitchell',
  dob: '1967-06-15',
  employmentStatus: 'EMPLOYED',
  earnedIncome: '120000',
  preTax401k: '620000',
  traditionalIra: '90000',
  rothIra: '40000',
  brokerage: '85000',
  cashSavingsCds: '30000',
  pia: '2900',
  receivingSocialSecurity: 'NO',
  // Claim age is not stated in the specification, so it stays blank and maps to null.
  claimAge: '',
  retirementAge: '63',
});
Object.assign(jamesLindaRaw.spouse, {
  firstName: 'Linda',
  lastName: 'Mitchell',
  // Synthetic date anchor; Section 14.2 supplies age, not date of birth.
  dob: '1969-06-15',
  employmentStatus: 'EMPLOYED',
  earnedIncome: '45000',
  pia: '1300',
  receivingSocialSecurity: 'NO',
  claimAge: '',
  retirementAge: '62',
});

const jamesLindaIllustrationOverrides = {} as const;

export const jamesLindaMitchellFixture: SampleHouseholdFixture = {
  label: 'SYNTHETIC',
  source: 'TODO.md original Section 14.2',
  household: 'James & Linda Mitchell',
  unknownAnswers: [
    'primary.claimAge',
    'spouse.claimAge',
    'allocation',
    'expenses.essentialMonthly',
    'health.currentCoverage',
    'health.preMedicarePlan',
    'primary.annuityTaxQualification',
    'spouse.annuityTaxQualification',
  ],
  supplements: [
    'Synthetic contact data, CA residence, and DOB anchors are needed by the final intake schema; they are not Section 14.2 facts.',
    'Section 14.2 gives household account balances but not ownership. This non-persistent fixture convention assigns them to James so the mapper can produce account owners.',
    'The three ranked concerns and [3,3,3,3,3] risk responses are schema-required synthetic proxies; the resulting score is 15/MODERATE.',
  ],
  raw: jamesLindaRaw,
  illustrationOverrides: jamesLindaIllustrationOverrides,
  planningInput: map(jamesLindaRaw, jamesLindaIllustrationOverrides),
};

const sarahRaw = syntheticBase();
Object.assign(sarahRaw, {
  firstName: 'Sarah',
  lastName: 'Thompson',
  email: 'sarah.thompson@example.invalid',
  phone: '555-010-1445',
  // Synthetic date anchor makes the supplied age 45 as of 2026-01-15.
  dob: '1980-06-15',
  state: 'CA',
  maritalStatus: 'SINGLE',
  filingStatus: 'SINGLE',
  dependents: '0',
  rankedConcerns: ['RUNNING_OUT_OF_MONEY', 'MARKET_CRASH', 'TAXES'],
  // A schema-required proxy for the supplied “aggressive risk” label.
  riskAnswers: [4, 4, 4, 4, 4],
  consent: true,
  allocation: { status: 'NOT_SURE', stocksPercent: '', bondsPercent: '', cashPercent: '' },
  // Section 14.2 supplies only one spending figure. The retirement value below is
  // an explicit fixture illustration, never a supplied client fact.
  expenses: { currentMonthly: '4800', retirementMonthly: '4800', essentialMonthly: '', discretionaryMonthly: '' },
  health: {
    familyLongevity: '',
    currentCoverage: '',
    preMedicarePlan: '',
    longTermCareInsurance: '',
    longTermCareDailyBenefit: '',
    disabilityInsurance: '',
  },
  estate: {
    will: { status: 'NO', updatedYear: '' },
    livingTrust: { status: 'NO', updatedYear: '' },
    financialPoa: { status: 'NO', updatedYear: '' },
    healthcareDirective: { status: 'NO', updatedYear: '' },
    updatedBeneficiaries: { status: 'NO', updatedYear: '' },
  },
});
Object.assign(sarahRaw.primary, {
  firstName: 'Sarah',
  lastName: 'Thompson',
  dob: '1980-06-15',
  employmentStatus: 'EMPLOYED',
  earnedIncome: '85000',
  preTax401k: '140000',
  rothIra: '25000',
  cashSavingsCds: '8000',
  employeeContributionPercent: '3',
  employerMatchPercent: '5',
  pia: '2100',
  receivingSocialSecurity: 'NO',
  // Retirement age is supplied; Social Security claiming age is not.
  claimAge: '',
  retirementAge: '67',
});

const sarahIllustrationOverrides = {} as const;

export const sarahThompsonFixture: SampleHouseholdFixture = {
  label: 'SYNTHETIC',
  source: 'TODO.md original Section 14.2',
  household: 'Sarah Thompson',
  unknownAnswers: [
    'primary.claimAge',
    'allocation',
    'expenses.essentialMonthly',
    'health.currentCoverage',
    'health.preMedicarePlan',
    'health.longTermCareInsurance',
    'primary.annuityTaxQualification',
    'home',
  ],
  supplements: [
    'Synthetic contact data, CA residence, and DOB anchor are needed by the final intake schema; they are not Section 14.2 facts.',
    'The three ranked concerns and [4,4,4,4,4] risk responses are schema-required synthetic proxies; the resulting score is 20/AGGRESSIVE.',
    'Section 14.2 gives no retirement-spending amount. The raw fixture explicitly illustrates retirement spending as $4,800/mo only to satisfy the final intake schema; essential spending remains unknown.',
  ],
  raw: sarahRaw,
  illustrationOverrides: sarahIllustrationOverrides,
  planningInput: map(sarahRaw, sarahIllustrationOverrides),
};

export const section14SampleHouseholdFixtures = [
  jamesLindaMitchellFixture,
  sarahThompsonFixture,
] as const;
