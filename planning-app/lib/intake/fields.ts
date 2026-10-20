export type FieldOption = { value: string; label: string };
export type FieldType =
  | 'text' | 'email' | 'tel' | 'date' | 'money' | 'number' | 'percentage'
  | 'select' | 'yes-no' | 'yes-no-unsure' | 'radio' | 'rank' | 'repeatable'
  | 'file' | 'checkbox' | 'review';

export type ShowWhen = { key: string; equals: string | string[] };

/** A display contract shared by the public intake and the advisor profile editor. */
export type FieldDescriptor = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  options?: FieldOption[];
  showWhen?: ShowWhen;
  fields?: FieldDescriptor[];
};

const option = (value: string, label: string): FieldOption => ({ value, label });
export const yesNoOptions = [option('YES', 'Yes'), option('NO', 'No')];
export const yesNoUnsureOptions = [...yesNoOptions, option('UNSURE', 'Not sure')];
export const employmentOptions = [
  option('EMPLOYED', 'Employed'), option('SELF_EMPLOYED', 'Self-employed'),
  option('RETIRED', 'Retired'), option('NOT_WORKING', 'Not working'),
];
export const healthOptions = [
  option('EXCELLENT', 'Excellent'), option('GOOD', 'Good'), option('FAIR', 'Fair'), option('POOR', 'Poor'),
];
export const coverageOptions = [
  option('EMPLOYER', 'Employer'), option('ACA', 'ACA marketplace'), option('RETIREE_PLAN', 'Retiree plan'),
  option('COBRA', 'COBRA'), option('SPOUSE_PLAN', "Spouse's plan"),
];
export const lifeInsuranceOptions = [
  option('TERM', 'Term'), option('WHOLE', 'Whole'), option('UNIVERSAL', 'Universal'), option('IUL', 'IUL'), option('GROUP', 'Group'),
];
export const concernOptions = [
  option('RUNNING_OUT_OF_MONEY', 'Running out of money'), option('TAXES', 'Taxes'), option('HEALTHCARE', 'Healthcare'),
  option('MARKET_CRASH', 'Market crash'), option('LEAVING_A_LEGACY', 'Leaving a legacy'), option('LONG_TERM_CARE', 'Long-term care'), option('INFLATION', 'Inflation'),
];

export const stateOptions = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
].map(([value, label]) => option(value, label));

const financialHelp = 'Use a whole-dollar estimate. You can find this on a recent statement.';
const personFields = (owner: 'primary' | 'spouse', spouseOnly = false): FieldDescriptor[] => {
  const person: FieldDescriptor[] = [
  { key: `${owner}.earnedIncome`, label: 'Annual gross earned income', type: 'money', required: true, help: 'Use annual pay before taxes and deductions.' },
  { key: `${owner}.pensionMonthly`, label: 'Expected pension at retirement (monthly)', type: 'money', help: financialHelp },
  { key: `${owner}.pensionStartAge`, label: 'Pension start age', type: 'number', help: 'Estimate the age pension payments begin.' },
  { key: `${owner}.pensionSurvivorPercent`, label: 'Pension survivor percentage', type: 'select', options: [option('0', '0%'), option('50', '50%'), option('75', '75%'), option('100', '100%')] },
  { key: `${owner}.pensionCola`, label: 'Pension includes a cost-of-living adjustment', type: 'yes-no', options: yesNoOptions },
  { key: `${owner}.annuityMonthly`, label: 'Existing annuity income (monthly)', type: 'money', help: financialHelp },
  { key: `${owner}.annuityStartAge`, label: 'Annuity income start age', type: 'number' },
  { key: `${owner}.annuityTaxQualification`, label: 'Annuity tax qualification', type: 'select', options: [option('QUALIFIED', 'Qualified (held in a retirement account)'), option('NONQUALIFIED', 'Nonqualified')] },
  { key: `${owner}.rentalOtherMonthly`, label: 'Rental / other retirement income (monthly)', type: 'money', help: financialHelp },
  { key: `${owner}.rentalEndAge`, label: 'Rental / other income end age', type: 'number' },
  { key: `${owner}.partTimeIncome`, label: 'Planned part-time income (annual)', type: 'money', help: 'This helps flag Social Security earnings-test considerations.' },
  { key: `${owner}.partTimeEndAge`, label: 'Part-time work end age', type: 'number' },

  { key: `${owner}.preTax401k`, label: '401(k) / 403(b) / 457 / TSP pre-tax balance', type: 'money', help: financialHelp },
  { key: `${owner}.roth401k`, label: 'Roth 401(k) balance', type: 'money', help: financialHelp },
  { key: `${owner}.traditionalIra`, label: 'Traditional / SEP / SIMPLE IRA balance', type: 'money', help: financialHelp },
  { key: `${owner}.rothIra`, label: 'Roth IRA balance', type: 'money', help: financialHelp },
  { key: `${owner}.hsaBalance`, label: 'HSA balance', type: 'money', help: 'Enter the HSA balance. HSA money is tax-free only for qualified medical expenses.' },
  { key: `${owner}.hsaEligibleForQualifiedExpenses`, label: 'HSA funds available for qualified medical expenses', type: 'yes-no-unsure', options: yesNoUnsureOptions },
  { key: `${owner}.brokerage`, label: 'Brokerage / taxable investments', type: 'money', help: financialHelp },
  { key: `${owner}.brokerageCostBasis`, label: 'Estimated taxable brokerage cost basis', type: 'money', help: 'Your statement or tax records may show this. Cost basis is different from market value.' },
  { key: `${owner}.cashSavingsCds`, label: 'Cash / savings / CDs', type: 'money', help: financialHelp },
  { key: `${owner}.annuityCashValue`, label: 'Fixed or indexed annuity cash value', type: 'money', help: financialHelp },
  { key: `${owner}.lifeInsuranceCashValue`, label: 'Cash value life insurance', type: 'money', help: 'Cash value insurance is kept separate from investable assets.' },
  { key: `${owner}.employeeContributionPercent`, label: 'Employee contribution rate', type: 'percentage', help: 'Use the percentage of pay you currently contribute.' },
  { key: `${owner}.employerMatchPercent`, label: 'Employer match rate', type: 'percentage', help: 'Use your plan’s matching percentage, if any.' },
  { key: `${owner}.iraRothContribution`, label: 'Current yearly IRA / Roth contribution', type: 'money', help: financialHelp },

  { key: `${owner}.pia`, label: 'Estimated monthly benefit at Full Retirement Age (PIA)', type: 'money', required: true, help: 'Log in at ssa.gov/myaccount and use the amount shown at your full retirement age.' },
  { key: `${owner}.receivingSocialSecurity`, label: 'Already receiving Social Security benefits', type: 'yes-no', options: yesNoOptions },
  { key: `${owner}.socialSecurityMonthly`, label: 'Current Social Security amount (monthly)', type: 'money', help: financialHelp, showWhen: { key: `${owner}.receivingSocialSecurity`, equals: 'YES' } },
  { key: `${owner}.socialSecurityStartAge`, label: 'Social Security benefit start age', type: 'number', showWhen: { key: `${owner}.receivingSocialSecurity`, equals: 'YES' } },
  { key: `${owner}.claimAge`, label: 'Planned Social Security claiming age', type: 'select', options: [...Array.from({ length: 9 }, (_, index) => option(String(index + 62), `Age ${index + 62}`)), option('ADVISE_ME', 'Advise me')] },
  { key: `${owner}.governmentPensionNonCovered`, label: 'Government pension from non-covered work', type: 'yes-no', options: yesNoOptions },

  { key: `${owner}.retirementAge`, label: 'Desired retirement age', type: 'number', required: true },
  { key: `${owner}.healthStatus`, label: 'Health status', type: 'select', options: healthOptions },
  { key: `${owner}.lifeInsuranceType`, label: 'Life insurance type', type: 'select', options: lifeInsuranceOptions },
  { key: `${owner}.lifeInsuranceDeathBenefit`, label: 'Life insurance death benefit', type: 'money', help: financialHelp },
  ];
  return person.map((field) => spouseOnly ? { ...field, showWhen: field.showWhen ?? { key: 'maritalStatus', equals: 'MARRIED' } } : field);
};

export const steps: Array<{ number: number; title: string; description: string; fields: FieldDescriptor[] }> = [
  {
    number: 1, title: 'About you', description: 'A few basics so we can tailor the planning conversation.', fields: [
      { key: 'firstName', label: 'First name', type: 'text', required: true }, { key: 'lastName', label: 'Last name', type: 'text', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true }, { key: 'phone', label: 'Phone', type: 'tel', required: true },
      { key: 'dob', label: 'Date of birth', type: 'date', required: true }, { key: 'state', label: 'State of residence', type: 'select', required: true, options: stateOptions },
      { key: 'maritalStatus', label: 'Marital status', type: 'select', required: true, options: [option('SINGLE', 'Single'), option('MARRIED', 'Married'), option('DIVORCED', 'Divorced'), option('WIDOWED', 'Widowed')] },
      { key: 'filingStatus', label: 'Tax filing status', type: 'select', required: true, options: [option('SINGLE', 'Single'), option('MARRIED_FILING_JOINTLY', 'Married Filing Jointly'), option('MARRIED_FILING_SEPARATELY', 'Married Filing Separately'), option('HEAD_OF_HOUSEHOLD', 'Head of Household')] },
      { key: 'spouse.firstName', label: 'Spouse first name', type: 'text', required: true, showWhen: { key: 'maritalStatus', equals: 'MARRIED' } },
      { key: 'spouse.lastName', label: 'Spouse last name', type: 'text', required: true, showWhen: { key: 'maritalStatus', equals: 'MARRIED' } },
      { key: 'spouse.dob', label: 'Spouse date of birth', type: 'date', required: true, showWhen: { key: 'maritalStatus', equals: 'MARRIED' } },
      { key: 'dependents', label: 'Number of dependents', type: 'number' }, { key: 'dependentsSpecialNeeds', label: 'Any dependents with special needs?', type: 'yes-no', options: yesNoOptions },
      { key: 'primary.employmentStatus', label: 'Your employment status', type: 'select', options: employmentOptions }, { key: 'spouse.employmentStatus', label: 'Spouse employment status', type: 'select', options: employmentOptions, showWhen: { key: 'maritalStatus', equals: 'MARRIED' } },
    ],
  },
  { number: 2, title: 'Income', description: 'Tell us about income now and expected income in retirement.', fields: [...personFields('primary'), ...personFields('spouse', true)].filter((field) => /earnedIncome|pension|annuity|rental|partTime/.test(field.key) && !/annuityCashValue/.test(field.key)) },
  { number: 3, title: 'Savings & investments', description: 'Balances are grouped by tax treatment, not by account number.', fields: [...personFields('primary'), ...personFields('spouse', true)].filter((field) => /preTax|roth|traditional|hsa|brokerage|cashSavings|annuityCash|lifeInsuranceCash|Contribution|Match/.test(field.key)).concat([
    { key: 'allocation.status', label: 'Do you know your approximate stock, bond and cash mix?', type: 'radio', options: [option('KNOWN', 'Yes, I know the mix'), option('NOT_SURE', 'Not sure')] },
    { key: 'allocation.stocksPercent', label: 'Stocks', type: 'percentage', help: 'Estimate the household percentage invested in stocks.', showWhen: { key: 'allocation.status', equals: 'KNOWN' } },
    { key: 'allocation.bondsPercent', label: 'Bonds', type: 'percentage', help: 'Estimate the household percentage invested in bonds.', showWhen: { key: 'allocation.status', equals: 'KNOWN' } },
    { key: 'allocation.cashPercent', label: 'Cash', type: 'percentage', help: 'Estimate the household percentage held in cash.', showWhen: { key: 'allocation.status', equals: 'KNOWN' } },
  ]) },
  { number: 4, title: 'Expenses, home & debts', description: 'Today’s dollars help make your retirement income needs clearer.', fields: [
    { key: 'expenses.currentMonthly', label: 'Current monthly spending', type: 'money', required: true, help: financialHelp }, { key: 'expenses.retirementMonthly', label: 'Expected monthly spending in retirement', type: 'money', required: true, help: 'Use today’s dollars; choose an estimate you can revisit.' },
    { key: 'expenses.essentialMonthly', label: 'Essential monthly retirement spending', type: 'money', help: 'Optional estimate for housing, food, utilities, taxes and insurance. If unknown, leave blank; do not assume all spending is essential.' }, { key: 'expenses.discretionaryMonthly', label: 'Discretionary monthly retirement spending', type: 'money', help: 'Include travel, hobbies and other flexible spending.' },
    { key: 'oneTimeGoals', label: 'Big one-time goals', type: 'repeatable', fields: [{ key: 'item', label: 'Item', type: 'text' }, { key: 'amount', label: 'Amount', type: 'money', help: financialHelp }, { key: 'year', label: 'Year', type: 'number' }] },
    { key: 'home.value', label: 'Home value', type: 'money', help: financialHelp }, { key: 'home.mortgageBalance', label: 'Mortgage balance', type: 'money', help: financialHelp }, { key: 'home.monthlyPayment', label: 'Mortgage monthly payment', type: 'money', help: financialHelp }, { key: 'home.payoffYear', label: 'Mortgage payoff year', type: 'number' },
    { key: 'debts', label: 'Other debts', type: 'repeatable', fields: [{ key: 'name', label: 'Debt', type: 'text' }, { key: 'balance', label: 'Balance', type: 'money', help: financialHelp }, { key: 'rate', label: 'Interest rate', type: 'percentage', help: 'Enter the annual percentage rate.' }, { key: 'monthlyPayment', label: 'Monthly payment', type: 'money', help: financialHelp }] },
  ] },
  { number: 5, title: 'Social Security', description: 'A Full Retirement Age estimate is the best starting point.', fields: [...personFields('primary'), ...personFields('spouse', true)].filter((field) => /pia|SocialSecurity|claimAge|governmentPension/.test(field.key)).concat([{ key: 'ssaUploadId', label: 'SSA statement (optional PDF)', type: 'file', help: 'Redact any sensitive identifiers before uploading. PDF files are stored privately and are not sent to AI services.' }]) },
  { number: 6, title: 'Retirement goals', description: 'Rank the priorities that matter most for your planning.', fields: [
    { key: 'primary.retirementAge', label: 'Your desired retirement age', type: 'number', required: true }, { key: 'spouse.retirementAge', label: 'Spouse desired retirement age', type: 'number', required: true, showWhen: { key: 'maritalStatus', equals: 'MARRIED' } },
    { key: 'lifestyle', label: 'Retirement lifestyle', type: 'select', options: [option('SIMPLE', 'Simple'), option('COMFORTABLE', 'Comfortable'), option('ACTIVE_TRAVEL', 'Active-travel'), option('LUXURY', 'Luxury')] }, { key: 'rankedConcerns', label: 'Rank your top three concerns', type: 'rank', required: true, options: concernOptions },
    { key: 'legacyAmount', label: 'Desired amount to leave heirs or charity', type: 'money', help: financialHelp }, { key: 'annualCharity', label: 'Charitable giving each year', type: 'money', help: financialHelp },
  ] },
  { number: 7, title: 'Health, insurance & risk', description: 'These answers support planning conversations, not insurance underwriting.', fields: [
    { key: 'primary.healthStatus', label: 'Your health status', type: 'select', options: healthOptions }, { key: 'spouse.healthStatus', label: 'Spouse health status', type: 'select', options: healthOptions, showWhen: { key: 'maritalStatus', equals: 'MARRIED' } },
    { key: 'health.familyLongevity', label: 'Did either parent live past age 85?', type: 'yes-no', options: yesNoOptions }, { key: 'health.currentCoverage', label: 'Current health coverage', type: 'select', options: coverageOptions }, { key: 'health.preMedicarePlan', label: 'Plan before Medicare', type: 'select', options: coverageOptions },
    { key: 'primary.lifeInsuranceType', label: 'Your life insurance type', type: 'select', options: lifeInsuranceOptions }, { key: 'primary.lifeInsuranceDeathBenefit', label: 'Your life insurance death benefit', type: 'money', help: financialHelp }, { key: 'spouse.lifeInsuranceType', label: 'Spouse life insurance type', type: 'select', options: lifeInsuranceOptions, showWhen: { key: 'maritalStatus', equals: 'MARRIED' } }, { key: 'spouse.lifeInsuranceDeathBenefit', label: 'Spouse life insurance death benefit', type: 'money', help: financialHelp, showWhen: { key: 'maritalStatus', equals: 'MARRIED' } },
    { key: 'health.longTermCareInsurance', label: 'Long-term care insurance?', type: 'yes-no', options: yesNoOptions }, { key: 'health.longTermCareDailyBenefit', label: 'Long-term care daily benefit', type: 'money', help: financialHelp, showWhen: { key: 'health.longTermCareInsurance', equals: 'YES' } }, { key: 'health.disabilityInsurance', label: 'Disability insurance (if still working)?', type: 'yes-no', options: yesNoOptions },
    { key: 'riskAnswers', label: 'Five-question risk questionnaire', type: 'radio', required: true },
  ] },
  { number: 8, title: 'Estate, review & consent', description: 'Review your answers before securely sending them to LSRT Insurance.', fields: [
    ...(['will', 'livingTrust', 'financialPoa', 'healthcareDirective', 'updatedBeneficiaries'] as const).flatMap((document) => [
      { key: `estate.${document}.status`, label: document === 'financialPoa' ? 'Financial power of attorney' : document === 'healthcareDirective' ? 'Healthcare directive' : document === 'updatedBeneficiaries' ? 'Updated beneficiaries' : document === 'livingTrust' ? 'Living trust' : 'Will', type: 'yes-no-unsure' as FieldType, options: yesNoUnsureOptions },
      { key: `estate.${document}.updatedYear`, label: 'Year last updated', type: 'number' as FieldType },
    ]),
    { key: 'review', label: 'Review your answers', type: 'review' }, { key: 'consent', label: 'Consent', type: 'checkbox', required: true },
  ] },
];

export const fields = steps.flatMap((step) => step.fields);
export const fieldsByKey = Object.fromEntries(fields.map((field) => [field.key, field])) as Record<string, FieldDescriptor>;
