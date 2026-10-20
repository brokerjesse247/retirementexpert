import { describe, expect, it } from 'vitest';
import { emptyIntake, intakeSchema, type IntakeData, validateStep } from '../lib/intake/schema';
import { firstIncompleteStep, resolveStepNavigation, safeDraftStep } from '../lib/intake/navigation';

function completeIntake(): IntakeData {
  const data = structuredClone(emptyIntake) as IntakeData;
  Object.assign(data, {
    firstName: 'Avery',
    lastName: 'Quinn',
    email: 'avery.quinn@example.com',
    phone: '555-555-0199',
    dob: '1965-06-15',
    state: 'CA',
    maritalStatus: 'SINGLE',
    filingStatus: 'SINGLE',
    dependents: '0',
    lifestyle: 'COMFORTABLE',
    rankedConcerns: ['TAXES', 'HEALTHCARE', 'INFLATION'],
    riskAnswers: [3, 4, 3, 2, 4],
    consent: true,
  });
  Object.assign(data.primary, {
    earnedIncome: '$120,000',
    pia: '$2,400',
    retirementAge: '65',
  });
  Object.assign(data.expenses, {
    currentMonthly: '$6,000',
    retirementMonthly: '$5,000',
    essentialMonthly: '$3,500',
  });
  return data;
}

function marriedIntake(): IntakeData {
  const data = completeIntake();
  data.maritalStatus = 'MARRIED';
  data.filingStatus = 'MARRIED_FILING_JOINTLY';
  Object.assign(data.spouse, {
    firstName: 'Robin',
    lastName: 'Quinn',
    dob: '1967-09-20',
    earnedIncome: '$85,000',
    pia: '$1,900',
    retirementAge: '64',
  });
  return data;
}

/** Simulates incomplete later screens in a persisted draft. */
function invalidateLaterSteps(data: IntakeData): IntakeData {
  data.riskAnswers = [];
  data.consent = false as IntakeData['consent'];
  return data;
}

function expectStepError(data: IntakeData, step: number, key: string) {
  expect(validateStep(data, step)[key]).toBeTruthy();
}

type RequiredInputCase = {
  label: string;
  step: number;
  key: string;
  setup?: (data: IntakeData) => void;
  remove: (data: IntakeData) => void;
};

const rootRequiredInputs: RequiredInputCase[] = [
  { label: 'first name', step: 1, key: 'firstName', remove: (data) => { data.firstName = ''; } },
  { label: 'last name', step: 1, key: 'lastName', remove: (data) => { data.lastName = ''; } },
  { label: 'email', step: 1, key: 'email', remove: (data) => { data.email = ''; } },
  { label: 'phone', step: 1, key: 'phone', remove: (data) => { data.phone = ''; } },
  { label: 'date of birth', step: 1, key: 'dob', remove: (data) => { data.dob = ''; } },
  { label: 'state', step: 1, key: 'state', remove: (data) => { data.state = ''; } },
  { label: 'marital status', step: 1, key: 'maritalStatus', remove: (data) => { data.maritalStatus = '' as IntakeData['maritalStatus']; } },
  { label: 'filing status', step: 1, key: 'filingStatus', remove: (data) => { data.filingStatus = '' as IntakeData['filingStatus']; } },
  { label: 'dependents count', step: 1, key: 'dependents', remove: (data) => { data.dependents = ''; } },
  { label: 'primary earned income', step: 2, key: 'primary.earnedIncome', remove: (data) => { data.primary.earnedIncome = ''; } },
  { label: 'current spending', step: 4, key: 'expenses.currentMonthly', remove: (data) => { data.expenses.currentMonthly = ''; } },
  { label: 'retirement spending', step: 4, key: 'expenses.retirementMonthly', remove: (data) => { data.expenses.retirementMonthly = ''; } },
  { label: 'primary PIA', step: 5, key: 'primary.pia', remove: (data) => { data.primary.pia = ''; } },
  { label: 'primary retirement age', step: 6, key: 'primary.retirementAge', remove: (data) => { data.primary.retirementAge = ''; } },
  { label: 'ranked concerns', step: 6, key: 'rankedConcerns', remove: (data) => { data.rankedConcerns = []; } },
  { label: 'risk questionnaire', step: 7, key: 'riskAnswers', remove: (data) => { data.riskAnswers = []; } },
  { label: 'consent', step: 8, key: 'consent', remove: (data) => { data.consent = false as IntakeData['consent']; } },
];

const conditionalRequiredInputs: RequiredInputCase[] = [
  { label: 'spouse first name when married', step: 1, key: 'spouse.firstName', remove: (data) => { data.spouse.firstName = ''; } },
  { label: 'spouse last name when married', step: 1, key: 'spouse.lastName', remove: (data) => { data.spouse.lastName = ''; } },
  { label: 'spouse date of birth when married', step: 1, key: 'spouse.dob', remove: (data) => { data.spouse.dob = ''; } },
  { label: 'spouse earned income when married', step: 2, key: 'spouse.earnedIncome', remove: (data) => { data.spouse.earnedIncome = ''; } },
  { label: 'spouse PIA when married', step: 5, key: 'spouse.pia', remove: (data) => { data.spouse.pia = ''; } },
  { label: 'spouse retirement age when married', step: 6, key: 'spouse.retirementAge', remove: (data) => { data.spouse.retirementAge = ''; } },
  { label: 'stocks percentage when allocation is known', step: 3, key: 'allocation.stocksPercent', setup: (data) => { data.allocation = { status: 'KNOWN', stocksPercent: '50', bondsPercent: '40', cashPercent: '10' }; }, remove: (data) => { data.allocation.stocksPercent = ''; } },
  { label: 'bonds percentage when allocation is known', step: 3, key: 'allocation.stocksPercent', setup: (data) => { data.allocation = { status: 'KNOWN', stocksPercent: '50', bondsPercent: '40', cashPercent: '10' }; }, remove: (data) => { data.allocation.bondsPercent = ''; } },
  { label: 'cash percentage when allocation is known', step: 3, key: 'allocation.stocksPercent', setup: (data) => { data.allocation = { status: 'KNOWN', stocksPercent: '50', bondsPercent: '40', cashPercent: '10' }; }, remove: (data) => { data.allocation.cashPercent = ''; } },
  { label: 'primary benefit amount when already receiving Social Security', step: 5, key: 'primary.socialSecurityMonthly', setup: (data) => { Object.assign(data.primary, { receivingSocialSecurity: 'YES', socialSecurityMonthly: '$1,800', socialSecurityStartAge: '65' }); }, remove: (data) => { data.primary.socialSecurityMonthly = ''; } },
  { label: 'primary benefit start age when already receiving Social Security', step: 5, key: 'primary.socialSecurityStartAge', setup: (data) => { Object.assign(data.primary, { receivingSocialSecurity: 'YES', socialSecurityMonthly: '$1,800', socialSecurityStartAge: '65' }); }, remove: (data) => { data.primary.socialSecurityStartAge = ''; } },
  { label: 'spouse benefit amount when already receiving Social Security', step: 5, key: 'spouse.socialSecurityMonthly', setup: (data) => { Object.assign(data.spouse, { receivingSocialSecurity: 'YES', socialSecurityMonthly: '$1,500', socialSecurityStartAge: '65' }); }, remove: (data) => { data.spouse.socialSecurityMonthly = ''; } },
  { label: 'spouse benefit start age when already receiving Social Security', step: 5, key: 'spouse.socialSecurityStartAge', setup: (data) => { Object.assign(data.spouse, { receivingSocialSecurity: 'YES', socialSecurityMonthly: '$1,500', socialSecurityStartAge: '65' }); }, remove: (data) => { data.spouse.socialSecurityStartAge = ''; } },
  { label: 'long-term-care daily benefit when insured', step: 7, key: 'health.longTermCareDailyBenefit', setup: (data) => { Object.assign(data.health, { longTermCareInsurance: 'YES', longTermCareDailyBenefit: '$250' }); }, remove: (data) => { data.health.longTermCareDailyBenefit = ''; } },
];

describe('strict step validation', () => {
  it('keeps intentionally optional answers blank in a complete, valid intake', () => {
    const data = completeIntake();
    data.expenses.essentialMonthly = '';
    data.expenses.discretionaryMonthly = '';

    expect(intakeSchema.safeParse(data).success).toBe(true);
    for (let step = 1; step <= 8; step += 1) expect(validateStep(data, step)).toEqual({});
    expect(firstIncompleteStep(data)).toBeNull();
  });

  it.each(rootRequiredInputs)('reports missing root required input: $label', ({ step, key, remove }) => {
    const data = invalidateLaterSteps(completeIntake());
    remove(data);

    expectStepError(data, step, key);
  });

  it.each(conditionalRequiredInputs)('reports missing conditional input: $label even with invalid later screens', ({ step, key, setup, remove }) => {
    const data = invalidateLaterSteps(marriedIntake());
    setup?.(data);
    remove(data);

    expectStepError(data, step, key);
  });

  it('catches the essential-spending limit despite blank later screens', () => {
    const data = invalidateLaterSteps(completeIntake());
    data.expenses.essentialMonthly = '$5,500';

    expectStepError(data, 4, 'expenses.essentialMonthly');
  });

  it('catches a known allocation that does not total 100 despite blank later screens', () => {
    const data = invalidateLaterSteps(completeIntake());
    data.allocation = { status: 'KNOWN', stocksPercent: '70', bondsPercent: '20', cashPercent: '5' };

    expectStepError(data, 3, 'allocation.stocksPercent');
  });

  it('requires a current Social Security benefit when the primary applicant is receiving it', () => {
    const data = invalidateLaterSteps(completeIntake());
    data.primary.receivingSocialSecurity = 'YES';
    data.primary.socialSecurityMonthly = '';
    data.primary.socialSecurityStartAge = '';

    expectStepError(data, 5, 'primary.socialSecurityMonthly');
    expectStepError(data, 5, 'primary.socialSecurityStartAge');
  });

  it('requires a spouse Social Security benefit when the spouse is receiving it', () => {
    const data = invalidateLaterSteps(marriedIntake());
    data.spouse.receivingSocialSecurity = 'YES';
    data.spouse.socialSecurityMonthly = '';
    data.spouse.socialSecurityStartAge = '';

    expectStepError(data, 5, 'spouse.socialSecurityMonthly');
    expectStepError(data, 5, 'spouse.socialSecurityStartAge');
  });

  it('requires long-term-care daily benefit when coverage is yes despite invalid risk and consent', () => {
    const data = invalidateLaterSteps(completeIntake());
    data.health.longTermCareInsurance = 'YES';
    data.health.longTermCareDailyBenefit = '';

    expectStepError(data, 7, 'health.longTermCareDailyBenefit');
  });

  it('requires all five risk answers while a later consent answer is invalid', () => {
    const data = completeIntake();
    data.riskAnswers = [3, 4, 3, 2];
    data.consent = false as IntakeData['consent'];

    expectStepError(data, 7, 'riskAnswers');
  });

  it('requires consent even when another step-eight field is invalid', () => {
    const data = completeIntake();
    data.estate.will.status = '' as IntakeData['estate']['will']['status'];
    data.consent = false as IntakeData['consent'];

    expectStepError(data, 8, 'consent');
  });
});

describe('strict draft step navigation', () => {
  it('clamps an empty draft that claims step eight back to step one', () => {
    const data = structuredClone(emptyIntake) as IntakeData;

    expect(firstIncompleteStep(data)).toBe(1);
    expect(safeDraftStep(data, 8)).toBe(1);
  });

  it('clamps a married draft with missing spouse income from claimed step eight to step two', () => {
    const data = marriedIntake();
    data.spouse.earnedIncome = '';

    expect(firstIncompleteStep(data)).toBe(2);
    expect(safeDraftStep(data, 8)).toBe(2);
  });

  it('blocks a jump from step one to step eight at the earliest incomplete step', () => {
    const data = structuredClone(emptyIntake) as IntakeData;
    const result = resolveStepNavigation(data, 1, 8);

    expect(result.allowed).toBe(false);
    expect(result.step).toBe(1);
    expect(result.errors.firstName).toBeTruthy();
  });

  it('re-locks forward navigation after a previously corrected required answer is deleted', () => {
    const data = completeIntake();
    data.firstName = '';

    const initiallyBlocked = resolveStepNavigation(data, 1, 8);
    expect(initiallyBlocked.allowed).toBe(false);
    expect(initiallyBlocked.step).toBe(1);

    data.firstName = 'Avery';
    const corrected = resolveStepNavigation(data, 1, 8);
    expect(corrected).toEqual({ allowed: true, step: 8, errors: {} });

    data.firstName = '';
    const relocked = resolveStepNavigation(data, 1, 8);
    expect(relocked.allowed).toBe(false);
    expect(relocked.step).toBe(1);
    expect(relocked.errors.firstName).toBeTruthy();
  });

  it('allows backward navigation without requiring the current invalid step to be repaired', () => {
    const data = structuredClone(emptyIntake) as IntakeData;
    const result = resolveStepNavigation(data, 6, 2);

    expect(result.allowed).toBe(true);
    expect(result.step).toBe(2);
    expect(result.errors).toEqual({});
  });
});
