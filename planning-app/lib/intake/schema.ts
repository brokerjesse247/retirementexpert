import { z } from 'zod';
import { stateOptions } from './fields';

/**
 * The intake stores user-entered financial values as normalized whole-dollar
 * strings. Persistence is responsible for converting the strings to cents;
 * JavaScript numbers are intentionally not used for money.
 */
const WHOLE_DOLLARS = /^(0|[1-9]\d*)$/;
const NUMBER_STRING = /^\d+(?:\.\d+)?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENT_YEAR = new Date().getFullYear();

const trim = (value: unknown) => (typeof value === 'string' ? value.trim() : value);
const normalizeMoney = (value: unknown) =>
  typeof value === 'string' ? value.replace(/[$,\s]/g, '') : value;

const moneyValue = z.string().max(15, 'Amount is too large.').regex(WHOLE_DOLLARS, 'Enter a whole-dollar amount.');
const money = z.preprocess(normalizeMoney, moneyValue);
const optionalMoney = z.preprocess(
  normalizeMoney,
  z.union([z.literal(''), moneyValue]),
);

const numberString = (min: number, max: number, message: string, integer = true) =>
  z.preprocess(
    trim,
    z.string().refine(
      (value) => NUMBER_STRING.test(value) && (!integer || Number.isInteger(Number(value))) && Number(value) >= min && Number(value) <= max,
      message,
    ),
  );

const optionalNumberString = (min: number, max: number, message: string, integer = true) =>
  z.preprocess(
    trim,
    z.union([
      z.literal(''),
      z.string().refine(
        (value) => NUMBER_STRING.test(value) && (!integer || Number.isInteger(Number(value))) && Number(value) >= min && Number(value) <= max,
        message,
      ),
    ]),
  );

const age = (min: number, max: number) => numberString(min, max, `Enter an age from ${min} to ${max}.`);
const optionalAge = (min: number, max: number) =>
  optionalNumberString(min, max, `Enter an age from ${min} to ${max}.`);
const percentage = optionalNumberString(0, 100, 'Enter a percentage from 0 to 100.', false);
const year = optionalNumberString(1900, 2200, 'Enter a valid year.');

function validDate(value: string) {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function ageOnToday(value: string) {
  const birthday = new Date(`${value}T00:00:00.000Z`);
  const today = new Date();
  let years = today.getUTCFullYear() - birthday.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - birthday.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < birthday.getUTCDate())) years -= 1;
  return years;
}

const dob = z.preprocess(
  trim,
  z.string().refine(
    (value) => validDate(value) && ageOnToday(value) >= 18 && ageOnToday(value) <= 90,
    'Enter a valid date of birth for an adult age 18–90.',
  ),
);
const optionalDob = z.preprocess(
  trim,
  z.union([
    z.literal(''),
    z.string().refine(
      (value) => validDate(value) && ageOnToday(value) >= 18 && ageOnToday(value) <= 90,
      'Enter a valid date of birth for an adult age 18–90.',
    ),
  ]),
);

const optionalText = z.preprocess(trim, z.string().max(200, 'Keep this answer under 200 characters.'));
const requiredText = (label: string) =>
  z.preprocess(trim, z.string().min(1, `${label} is required.`).max(/name/i.test(label) ? 120 : 200, `Keep ${label.toLowerCase()} within the allowed length.`));
const optionalName = z.preprocess(trim, z.string().max(120, 'Keep names under 120 characters.'));
const email = z.preprocess(trim, z.string().email('Enter a valid email address.').max(254));
const phone = z.preprocess(
  trim,
  z.string().refine(
    (value) => /^[+()\-\s.\d]{7,25}$/.test(value) && value.replace(/\D/g, '').length >= 7,
    'Enter a valid phone number.',
  ),
);

const maritalStatuses = ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'] as const;
const filingStatuses = ['SINGLE', 'MARRIED_FILING_JOINTLY', 'MARRIED_FILING_SEPARATELY', 'HEAD_OF_HOUSEHOLD'] as const;
const employmentStatuses = ['EMPLOYED', 'SELF_EMPLOYED', 'RETIRED', 'NOT_WORKING'] as const;
const yesNo = ['YES', 'NO'] as const;
const yesNoUnsure = ['YES', 'NO', 'UNSURE'] as const;
const healthStatuses = ['EXCELLENT', 'GOOD', 'FAIR', 'POOR'] as const;
const coverageTypes = ['EMPLOYER', 'ACA', 'RETIREE_PLAN', 'COBRA', 'SPOUSE_PLAN'] as const;
const lifeInsuranceTypes = ['TERM', 'WHOLE', 'UNIVERSAL', 'IUL', 'GROUP'] as const;
const concernValues = [
  'RUNNING_OUT_OF_MONEY',
  'TAXES',
  'HEALTHCARE',
  'MARKET_CRASH',
  'LEAVING_A_LEGACY',
  'LONG_TERM_CARE',
  'INFLATION',
] as const;

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) => z.enum(['', ...values] as [string, ...string[]]);

const personSchema = (requiredFinancial: boolean) =>
  z.object({
    // The primary applicant's identity is intentionally flat at the root.
    // Nested identity values are retained for the conditional spouse record.
    firstName: optionalName,
    lastName: optionalName,
    dob: optionalDob,
    employmentStatus: optionalEnum(employmentStatuses),

    earnedIncome: requiredFinancial ? money : optionalMoney,
    pensionMonthly: optionalMoney,
    pensionStartAge: optionalAge(40, 100),
    pensionSurvivorPercent: optionalEnum(['0', '50', '75', '100'] as const),
    pensionCola: optionalEnum(yesNo),
    annuityMonthly: optionalMoney,
    annuityStartAge: optionalAge(40, 100),
    // Added clarification: qualified and nonqualified annuities have different tax treatment.
    annuityTaxQualification: optionalEnum(['QUALIFIED', 'NONQUALIFIED'] as const),
    rentalOtherMonthly: optionalMoney,
    rentalEndAge: optionalAge(40, 110),
    partTimeIncome: optionalMoney,
    partTimeEndAge: optionalAge(40, 100),

    preTax401k: optionalMoney,
    roth401k: optionalMoney,
    traditionalIra: optionalMoney,
    rothIra: optionalMoney,
    hsaBalance: optionalMoney,
    // Added clarification: an HSA balance is only tax-free for qualified medical expenses.
    hsaEligibleForQualifiedExpenses: optionalEnum(['YES', 'NO', 'UNSURE'] as const),
    brokerage: optionalMoney,
    brokerageCostBasis: optionalMoney,
    cashSavingsCds: optionalMoney,
    annuityCashValue: optionalMoney,
    lifeInsuranceCashValue: optionalMoney,
    employeeContributionPercent: percentage,
    employerMatchPercent: percentage,
    iraRothContribution: optionalMoney,

    pia: requiredFinancial ? money : optionalMoney,
    receivingSocialSecurity: optionalEnum(yesNo),
    socialSecurityMonthly: optionalMoney,
    socialSecurityStartAge: optionalAge(62, 100),
    claimAge: optionalEnum(['62', '63', '64', '65', '66', '67', '68', '69', '70', 'ADVISE_ME'] as const),
    governmentPensionNonCovered: optionalEnum(yesNo),

    retirementAge: requiredFinancial ? age(50, 80) : optionalAge(50, 80),
    healthStatus: optionalEnum(healthStatuses),
    lifeInsuranceType: optionalEnum(lifeInsuranceTypes),
    lifeInsuranceDeathBenefit: optionalMoney,
  });

const estateDocumentSchema = z.object({
  status: z.enum(yesNoUnsure),
  updatedYear: year,
});

const baseSchema = z.object({
  // Flat client identity fields are intentionally stable for the Client record.
  firstName: requiredText('First name'),
  lastName: requiredText('Last name'),
  email,
  phone,
  dob,
  state: requiredText('State of residence').refine((value) => stateOptions.some((option) => option.value === value), 'Select a state.'),
  maritalStatus: z.enum(maritalStatuses),
  filingStatus: z.enum(filingStatuses),
  dependents: numberString(0, 99, 'Enter a number from 0 to 99.'),
  dependentsSpecialNeeds: optionalEnum(yesNo),

  primary: personSchema(true),
  spouse: personSchema(false),

  allocation: z.object({
    status: z.enum(['KNOWN', 'NOT_SURE']),
    stocksPercent: percentage,
    bondsPercent: percentage,
    cashPercent: percentage,
  }),

  expenses: z.object({
    currentMonthly: money,
    retirementMonthly: money,
    essentialMonthly: money,
    discretionaryMonthly: optionalMoney,
  }),
  oneTimeGoals: z.array(z.object({
    item: requiredText('Goal item'),
    amount: money,
    year: numberString(CURRENT_YEAR, 2200, `Enter a year from ${CURRENT_YEAR} onward.`),
  })).max(20, 'Add no more than 20 one-time goals.'),
  home: z.object({
    value: optionalMoney,
    mortgageBalance: optionalMoney,
    monthlyPayment: optionalMoney,
    payoffYear: year,
  }),
  debts: z.array(z.object({
    name: requiredText('Debt name'),
    balance: money,
    rate: numberString(0, 100, 'Enter a rate from 0 to 100.', false),
    monthlyPayment: money,
  })).max(30, 'Add no more than 30 debts.'),

  ssaUploadId: z.preprocess(trim, z.string().max(200)),
  lifestyle: z.enum(['SIMPLE', 'COMFORTABLE', 'ACTIVE_TRAVEL', 'LUXURY']),
  rankedConcerns: z.array(z.enum(concernValues)).length(3, 'Choose and rank exactly three concerns.'),
  legacyAmount: optionalMoney,
  annualCharity: optionalMoney,

  health: z.object({
    familyLongevity: optionalEnum(yesNo),
    currentCoverage: optionalEnum(coverageTypes),
    preMedicarePlan: optionalEnum(coverageTypes),
    longTermCareInsurance: optionalEnum(yesNo),
    longTermCareDailyBenefit: optionalMoney,
    disabilityInsurance: optionalEnum(yesNo),
  }),
  riskAnswers: z.array(z.number().int().min(1).max(5)).length(5, 'Answer all five risk questions.'),

  estate: z.object({
    will: estateDocumentSchema,
    livingTrust: estateDocumentSchema,
    financialPoa: estateDocumentSchema,
    healthcareDirective: estateDocumentSchema,
    updatedBeneficiaries: estateDocumentSchema,
  }),
  consent: z.literal(true, { errorMap: () => ({ message: 'Consent is required to submit.' }) }),
  // Honeypot: must remain empty and is never rendered to ordinary users.
  website: z.literal(''),
});

/** Final, server-shared submission contract. */
export const intakeSchema = baseSchema.superRefine((data, context) => {
  if (data.maritalStatus === 'MARRIED') {
    const spouse = data.spouse;
    if (!spouse.firstName) context.addIssue({ code: z.ZodIssueCode.custom, path: ['spouse', 'firstName'], message: 'Spouse first name is required when married.' });
    if (!spouse.lastName) context.addIssue({ code: z.ZodIssueCode.custom, path: ['spouse', 'lastName'], message: 'Spouse last name is required when married.' });
    if (!spouse.dob) context.addIssue({ code: z.ZodIssueCode.custom, path: ['spouse', 'dob'], message: 'Spouse date of birth is required when married.' });
    if (!spouse.earnedIncome) context.addIssue({ code: z.ZodIssueCode.custom, path: ['spouse', 'earnedIncome'], message: 'Spouse earned income is required when married.' });
    if (!spouse.pia) context.addIssue({ code: z.ZodIssueCode.custom, path: ['spouse', 'pia'], message: 'Spouse PIA is required when married.' });
    if (!spouse.retirementAge) context.addIssue({ code: z.ZodIssueCode.custom, path: ['spouse', 'retirementAge'], message: 'Spouse retirement age is required when married.' });
  }

  if (Number(data.expenses.essentialMonthly) > Number(data.expenses.retirementMonthly)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['expenses', 'essentialMonthly'], message: 'Essential spending cannot exceed total retirement spending.' });
  }

  if (data.allocation.status === 'KNOWN') {
    const values = [data.allocation.stocksPercent, data.allocation.bondsPercent, data.allocation.cashPercent];
    if (values.some((value) => value === '')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['allocation', 'stocksPercent'], message: 'Enter stocks, bonds, and cash percentages or choose “Not sure”.' });
    } else if (values.reduce((total, value) => total + Number(value), 0) !== 100) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['allocation', 'stocksPercent'], message: 'Stocks, bonds, and cash must total 100%.' });
    }
  }

  for (const owner of ['primary', 'spouse'] as const) {
    const person = data[owner];
    if (person.receivingSocialSecurity === 'YES') {
      if (!person.socialSecurityMonthly) context.addIssue({ code: z.ZodIssueCode.custom, path: [owner, 'socialSecurityMonthly'], message: 'Enter the current monthly benefit.' });
      if (!person.socialSecurityStartAge) context.addIssue({ code: z.ZodIssueCode.custom, path: [owner, 'socialSecurityStartAge'], message: 'Enter the benefit start age.' });
    }
  }

  if (data.health.longTermCareInsurance === 'YES' && !data.health.longTermCareDailyBenefit) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['health', 'longTermCareDailyBenefit'], message: 'Enter the daily long-term care benefit.' });
  }

  if (new Set(data.rankedConcerns).size !== data.rankedConcerns.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['rankedConcerns'], message: 'Choose three different concerns.' });
  }
});

export type IntakeData = z.infer<typeof intakeSchema>;

const emptyPerson = {
  firstName: '', lastName: '', dob: '', employmentStatus: '',
  earnedIncome: '', pensionMonthly: '', pensionStartAge: '', pensionSurvivorPercent: '', pensionCola: '',
  annuityMonthly: '', annuityStartAge: '', annuityTaxQualification: '', rentalOtherMonthly: '', rentalEndAge: '',
  partTimeIncome: '', partTimeEndAge: '',
  preTax401k: '', roth401k: '', traditionalIra: '', rothIra: '', hsaBalance: '', hsaEligibleForQualifiedExpenses: '',
  brokerage: '', brokerageCostBasis: '', cashSavingsCds: '', annuityCashValue: '', lifeInsuranceCashValue: '',
  employeeContributionPercent: '', employerMatchPercent: '', iraRothContribution: '',
  pia: '', receivingSocialSecurity: '', socialSecurityMonthly: '', socialSecurityStartAge: '', claimAge: '', governmentPensionNonCovered: '',
  retirementAge: '', healthStatus: '', lifeInsuranceType: '', lifeInsuranceDeathBenefit: '',
};

/** A complete, non-persistent draft shape. It is intentionally not final-schema valid. */
export const emptyIntake = {
  firstName: '', lastName: '', email: '', phone: '', dob: '', state: '', maritalStatus: '', filingStatus: '',
  dependents: '0', dependentsSpecialNeeds: '',
  primary: { ...emptyPerson },
  spouse: { ...emptyPerson },
  allocation: { status: 'NOT_SURE', stocksPercent: '', bondsPercent: '', cashPercent: '' },
  expenses: { currentMonthly: '', retirementMonthly: '', essentialMonthly: '', discretionaryMonthly: '' },
  oneTimeGoals: [],
  home: { value: '', mortgageBalance: '', monthlyPayment: '', payoffYear: '' },
  debts: [],
  ssaUploadId: '',
  lifestyle: 'COMFORTABLE',
  rankedConcerns: [],
  legacyAmount: '',
  annualCharity: '',
  health: { familyLongevity: '', currentCoverage: '', preMedicarePlan: '', longTermCareInsurance: '', longTermCareDailyBenefit: '', disabilityInsurance: '' },
  riskAnswers: [],
  estate: {
    will: { status: 'UNSURE', updatedYear: '' },
    livingTrust: { status: 'UNSURE', updatedYear: '' },
    financialPoa: { status: 'UNSURE', updatedYear: '' },
    healthcareDirective: { status: 'UNSURE', updatedYear: '' },
    updatedBeneficiaries: { status: 'UNSURE', updatedYear: '' },
  },
  consent: false,
  website: '',
} as unknown as IntakeData;

/** Drafts must save even while required fields are blank or mid-edit.
 * Only the known shape is accepted; final formats/cross-field rules remain
 * the responsibility of intakeSchema and step navigation. */
function draftShape(value: unknown): z.ZodTypeAny {
  if (typeof value === 'string') return z.string().max(200);
  if (typeof value === 'boolean') return z.boolean();
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return z.object(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, draftShape(item)]))).strict();
  }
  throw new Error('Unsupported draft field.');
}
const draftRoot = Object.fromEntries(Object.entries(emptyIntake).filter(([, value]) => !Array.isArray(value)).map(([key, value]) => [key, draftShape(value)]));
export const draftSchema = z.object({
  ...draftRoot,
  oneTimeGoals: z.array(z.object({item:z.string().max(200),amount:z.string().max(200),year:z.string().max(200)}).strict()).max(20),
  debts: z.array(z.object({name:z.string().max(200),balance:z.string().max(200),rate:z.string().max(200),monthlyPayment:z.string().max(200)}).strict()).max(30),
  rankedConcerns: z.array(z.string().max(40)).max(3),
  riskAnswers: z.array(z.number().int().min(0).max(5)).max(5),
  website: z.literal(''),
}).strict();

const stepPrefixes: Record<number, string[]> = {
  1: ['firstName', 'lastName', 'email', 'phone', 'dob', 'state', 'maritalStatus', 'filingStatus', 'dependents', 'dependentsSpecialNeeds', 'spouse.firstName', 'spouse.lastName', 'spouse.dob', 'primary.employmentStatus', 'spouse.employmentStatus'],
  2: ['primary.earnedIncome', 'spouse.earnedIncome', 'primary.pension', 'spouse.pension', 'primary.annuity', 'spouse.annuity', 'primary.rental', 'spouse.rental', 'primary.partTime', 'spouse.partTime'],
  3: ['primary.preTax', 'spouse.preTax', 'primary.roth', 'spouse.roth', 'primary.traditional', 'spouse.traditional', 'primary.hsa', 'spouse.hsa', 'primary.brokerage', 'spouse.brokerage', 'primary.cashSavings', 'spouse.cashSavings', 'primary.annuityCash', 'spouse.annuityCash', 'primary.lifeInsuranceCash', 'spouse.lifeInsuranceCash', 'primary.employeeContribution', 'spouse.employeeContribution', 'primary.employerMatch', 'spouse.employerMatch', 'primary.iraRothContribution', 'spouse.iraRothContribution', 'allocation'],
  4: ['expenses', 'oneTimeGoals', 'home', 'debts'],
  5: ['primary.pia', 'spouse.pia', 'primary.receivingSocialSecurity', 'spouse.receivingSocialSecurity', 'primary.socialSecurity', 'spouse.socialSecurity', 'primary.claimAge', 'spouse.claimAge', 'primary.governmentPension', 'spouse.governmentPension', 'ssaUploadId'],
  6: ['primary.retirementAge', 'spouse.retirementAge', 'lifestyle', 'rankedConcerns', 'legacyAmount', 'annualCharity'],
  7: ['primary.healthStatus', 'spouse.healthStatus', 'primary.lifeInsurance', 'spouse.lifeInsurance', 'health', 'riskAnswers'],
  8: ['estate', 'consent', 'website'],
};

/**
 * Validates only the fields shown on a step. Final submission must still use
 * intakeSchema, which validates the entire object and cross-step rules.
 */
export function validateStep(data: IntakeData, step: number): Record<string, string> {
  const parsed = intakeSchema.safeParse(data);
  if (parsed.success) return {};
  const prefixes = stepPrefixes[step] ?? [];
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.');
    if (prefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}.`) || key.startsWith(prefix) && /^[A-Z]/.test(key.slice(prefix.length, prefix.length + 1)))) {
      errors[key] ??= issue.message;
    }
  }
  return errors;
}

export const CONSENT_TEXT = 'I agree LSRT Insurance may use this information to prepare my retirement analysis and contact me. I understand this is not tax or legal advice.';
