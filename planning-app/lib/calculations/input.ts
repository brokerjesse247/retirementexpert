import { z } from 'zod';
import type { IntakeData } from '../intake/schema';
import type { AnalysisRunOptions, PersonRole, PlanningAccount, PlanningAssumptions, PlanningInput, PlanningPerson, RiskProfile } from './types';
import { ageMonthsOn, dollars, roundMoney } from './math';

const ACCOUNT_TYPES = ['K401_PRETAX', 'ROTH_401K', 'TRAD_IRA', 'ROTH_IRA', 'HSA', 'BROKERAGE', 'CASH', 'ANNUITY', 'CASH_VALUE_LIFE'] as const;
const PERSON_ROLES = ['PRIMARY', 'SPOUSE'] as const;
const YEAR_KEY = /^20\d{2}$/;
const money = z.number().finite().min(0).max(1e12);
const rate = z.number().finite().gt(-1).max(1);

/** Backward-compatible optional Base-analysis settings. */
export const analysisOverridesSchema = z.object({
  primaryClaimAge: z.number().int().min(62).max(70).optional(),
  spouseClaimAge: z.number().int().min(62).max(70).optional(),
  primaryPlanningAge: z.number().int().min(80).max(110).optional(),
  spousePlanningAge: z.number().int().min(80).max(110).optional(),
  essentialMonthlySpending: z.number().finite().min(0).max(1e8).optional(),
  healthcareIncludedInSpending: z.boolean().optional(),
  primaryIraDestination: z.enum(['TRAD_IRA', 'ROTH_IRA']).optional(),
  spouseIraDestination: z.enum(['TRAD_IRA', 'ROTH_IRA']).optional(),
  historicalMagi: z.record(z.string().regex(YEAR_KEY), money).optional(),
  spouseLivedTogetherForMfs: z.boolean().optional(),
}).strict();
export type AnalysisOverrides = z.infer<typeof analysisOverridesSchema>;

const scenarioPersonOverrideSchema = z.object({
  retirementAge: z.number().int().min(50).max(80).optional(),
  retirementAgeMonths: z.number().int().min(50 * 12).max(80 * 12).optional(),
  socialSecurityClaimAge: z.number().int().min(62).max(70).optional(),
  socialSecurityClaimAgeMonths: z.number().int().min(62 * 12).max(70 * 12).optional(),
  planningAge: z.number().int().min(80).max(110).optional(),
}).strict().superRefine((value, context) => {
  if (value.retirementAge !== undefined && value.retirementAgeMonths !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Supply either retirementAge or retirementAgeMonths, not both.' });
  }
  if (value.socialSecurityClaimAge !== undefined && value.socialSecurityClaimAgeMonths !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Supply either socialSecurityClaimAge or socialSecurityClaimAgeMonths, not both.' });
  }
});

const accountOverrideSchema = z.object({
  owner: z.enum(PERSON_ROLES),
  type: z.enum(ACCOUNT_TYPES),
  balance: money,
  /** A supplied basis must not exceed the supplied replacement balance. */
  costBasis: money.nullable().optional(),
  annuityQualification: z.enum(['QUALIFIED', 'NONQUALIFIED']).nullable().optional(),
  hsaQualified: z.boolean().nullable().optional(),
}).strict().superRefine((value, context) => {
  if (value.costBasis !== undefined && value.costBasis !== null && value.costBasis > value.balance) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['costBasis'], message: 'Account cost basis cannot exceed its balance.' });
  }
});

const ltcEventSchema = z.object({
  /** The one supported event is assigned to the primary person. */
  person: z.literal('PRIMARY').optional(),
  startAge: z.number().int().min(40).max(110),
  durationYears: z.number().int().min(1).max(20),
  /** Nominal monthly gross care cost, supplied by the advisor for this what-if. */
  monthlyCost: money,
  /** Optional supplied benefit used only as a level daily offset; no rider is inferred. */
  coverageDailyBenefit: money.optional(),
}).strict();

const hypotheticalAnnuitySchema = z.object({
  owner: z.enum(PERSON_ROLES),
  fundingAccount: z.object({ owner: z.enum(PERSON_ROLES), type: z.enum(ACCOUNT_TYPES) }).strict(),
  premium: money.refine((value) => value > 0, 'Premium must be greater than zero.'),
  /** Advisor-supplied periodic income, not a carrier quote. */
  monthlyIncome: money.refine((value) => value > 0, 'Monthly income must be greater than zero.'),
  startAge: z.number().int().min(40).max(110),
  /** Omission intentionally remains unknown rather than being guessed. */
  taxQualification: z.enum(['QUALIFIED', 'NONQUALIFIED', 'UNKNOWN']).optional(),
}).strict();

/**
 * The persisted what-if shape is deliberately nested and strict. Any property
 * outside this contract is rejected rather than silently ignored.
 */
export const scenarioOverridesSchema = z.object({
  /** Base-compatible clarification fields, scoped to this scenario only. */
  general: analysisOverridesSchema.optional(),
  people: z.object({
    PRIMARY: scenarioPersonOverrideSchema.optional(),
    SPOUSE: scenarioPersonOverrideSchema.optional(),
  }).strict().optional(),
  /** Existing account replacement balances; a missing account is rejected at application time. */
  accounts: z.array(accountOverrideSchema).max(18).optional(),
  spending: z.object({
    currentMonthly: money.optional(),
    retirementMonthly: money.optional(),
    essentialMonthly: money.nullable().optional(),
    annualCharity: money.optional(),
    healthcareIncluded: z.boolean().optional(),
  }).strict().optional(),
  returns: z.object({
    /** Fraction, e.g. 0.055 for 5.5%; UI presents this as a percentage. */
    annualRate: rate.optional(),
    /** Fractional calendar-year returns used by the actual cash-flow projection. */
    returnByYear: z.record(z.string().regex(YEAR_KEY), rate).optional(),
  }).strict().optional(),
  inflation: z.object({ annualRate: z.number().finite().min(0).max(1) }).strict().optional(),
  /** Dollar conversion amounts keyed by the actual calendar year. */
  rothSchedule: z.record(z.string().regex(YEAR_KEY), money).optional(),
  ltcEvent: ltcEventSchema.optional(),
  annuityPurchase: hypotheticalAnnuitySchema.optional(),
}).strict();
export type ScenarioOverrides = z.infer<typeof scenarioOverridesSchema>;

export interface EffectiveScenarioInput {
  input: PlanningInput;
  assumptions: PlanningAssumptions;
  engineOptions: AnalysisRunOptions;
}

const yesNo = (value: string): boolean | null => value === 'YES' ? true : value === 'NO' ? false : null;
const optionalNumber = (value: string): number | null => value === '' ? null : Number(value);

export function mapPlanningInput(data: IntakeData, assumptions: PlanningAssumptions, asOfDate: string, overrides: AnalysisOverrides = {}): PlanningInput {
  const warnings: string[] = [];
  const riskScore = data.riskAnswers.reduce((a, b) => a + b, 0);
  const riskProfile: RiskProfile = riskScore <= 11 ? 'CONSERVATIVE' : riskScore <= 18 ? 'MODERATE' : 'AGGRESSIVE';
  const roles: PersonRole[] = data.maritalStatus === 'MARRIED' ? ['PRIMARY', 'SPOUSE'] : ['PRIMARY'];
  const persons: PlanningPerson[] = roles.map((role) => {
    const person = role === 'PRIMARY' ? data.primary : data.spouse;
    const prefix = role === 'PRIMARY' ? 'primary' : 'spouse';
    const dob = role === 'PRIMARY' ? data.dob : person.dob;
    const planningOverride = role === 'PRIMARY' ? overrides.primaryPlanningAge : overrides.spousePlanningAge;
    const claimOverride = role === 'PRIMARY' ? overrides.primaryClaimAge : overrides.spouseClaimAge;
    const planningAge = planningOverride ?? (person.healthStatus === 'POOR' ? assumptions.planningAgePoorHealth : person.healthStatus === 'EXCELLENT' && data.health.familyLongevity === 'YES' ? assumptions.planningAgeExcellentLongevity : assumptions.planningAgeDefault);
    const currentAgeMonths = ageMonthsOn(dob, asOfDate);
    if (currentAgeMonths < 18 * 12 || currentAgeMonths > 91 * 12) throw new Error('Client date of birth is outside supported planning ages.');
    if (planningAge * 12 <= currentAgeMonths) throw new Error(`${prefix}: planning age must exceed current age.`);
    const name = role === 'PRIMARY' ? `${data.firstName} ${data.lastName}` : `${person.firstName} ${person.lastName}`;
    const alreadyReceiving = person.receivingSocialSecurity === 'YES';
    if (alreadyReceiving && claimOverride !== undefined) {
      throw new Error(`${prefix}: Social Security is already being received, so a claim-age override cannot recompute or adjust that benefit.`);
    }
    const claimAgeMonths = claimOverride !== undefined ? claimOverride * 12 : /^\d+$/.test(person.claimAge) ? Number(person.claimAge) * 12 : null;
    if (!alreadyReceiving && claimAgeMonths === null) warnings.push(`${name}: claiming age is not selected; the baseline uses full retirement age while comparing alternatives.`);
    return {
      role, name, dob, ageMonths: currentAgeMonths, retirementAgeMonths: Number(person.retirementAge) * 12, planningAge,
      earnedIncomeAnnual: dollars(person.earnedIncome), employeeContributionRate: Number(person.employeeContributionPercent || 0) / 100,
      employerMatchRate: Number(person.employerMatchPercent || 0) / 100, combinedIraContributionAnnual: dollars(person.iraRothContribution),
      iraContributionDestination: (role === 'PRIMARY' ? overrides.primaryIraDestination : overrides.spouseIraDestination) ?? null,
      piaMonthly: dollars(person.pia), claimAgeMonths, alreadyReceiving,
      currentBenefitMonthly: person.socialSecurityMonthly === '' ? null : dollars(person.socialSecurityMonthly),
      benefitStartAgeMonths: person.socialSecurityStartAge === '' ? null : Number(person.socialSecurityStartAge) * 12,
      pensionMonthly: dollars(person.pensionMonthly), pensionStartAgeMonths: person.pensionStartAge === '' ? null : Number(person.pensionStartAge) * 12,
      pensionSurvivorRate: person.pensionSurvivorPercent === '' ? null : Number(person.pensionSurvivorPercent) / 100, pensionCola: yesNo(person.pensionCola),
      annuityMonthly: dollars(person.annuityMonthly), annuityStartAgeMonths: person.annuityStartAge === '' ? null : Number(person.annuityStartAge) * 12,
      annuityQualification: person.annuityTaxQualification === 'QUALIFIED' || person.annuityTaxQualification === 'NONQUALIFIED' ? person.annuityTaxQualification : null,
      rentalOtherMonthly: dollars(person.rentalOtherMonthly), rentalEndAgeMonths: person.rentalEndAge === '' ? null : Number(person.rentalEndAge) * 12,
      partTimeAnnual: dollars(person.partTimeIncome), partTimeEndAgeMonths: person.partTimeEndAge === '' ? null : Number(person.partTimeEndAge) * 12,
      healthStatus: person.healthStatus || null, lifeInsuranceDeathBenefit: dollars(person.lifeInsuranceDeathBenefit), lifeInsuranceType: person.lifeInsuranceType || null,
      governmentNoncoveredPension: person.governmentPensionNonCovered === 'YES',
    };
  });
  const accounts: PlanningInput['accounts'] = [];
  for (const role of roles) {
    const p = role === 'PRIMARY' ? data.primary : data.spouse;
    const accountFields = [['preTax401k', 'K401_PRETAX'], ['roth401k', 'ROTH_401K'], ['traditionalIra', 'TRAD_IRA'], ['rothIra', 'ROTH_IRA'], ['hsaBalance', 'HSA'], ['brokerage', 'BROKERAGE'], ['cashSavingsCds', 'CASH'], ['annuityCashValue', 'ANNUITY'], ['lifeInsuranceCashValue', 'CASH_VALUE_LIFE']] as const;
    for (const [key, type] of accountFields) {
      const balance = dollars(p[key]);
      if (balance > 0) accounts.push({ owner: role, type, balance, costBasis: type === 'BROKERAGE' && p.brokerageCostBasis !== '' ? dollars(p.brokerageCostBasis) : null, annuityQualification: p.annuityTaxQualification === 'QUALIFIED' || p.annuityTaxQualification === 'NONQUALIFIED' ? p.annuityTaxQualification : null, hsaQualified: yesNo(p.hsaEligibleForQualifiedExpenses) });
    }
  }
  const retirementMonthly = dollars(data.expenses.retirementMonthly);
  const essential = overrides.essentialMonthlySpending ?? (data.expenses.essentialMonthly === '' ? null : dollars(data.expenses.essentialMonthly));
  if (essential !== null && essential > retirementMonthly) throw new Error('Essential spending cannot exceed total retirement spending.');
  if (essential === null) warnings.push('Essential spending is unknown; income coverage and complete readiness scoring require that optional analysis input.');
  if (overrides.healthcareIncludedInSpending === undefined) warnings.push('Baseline assumes healthcare costs are additional to the living budget. Confirm this in analysis settings to prevent double-counting.');
  if (assumptions.stateTaxRate === null) warnings.push('State income tax is not modeled; no verified state rate was supplied.');
  const spouseLivedTogetherForMfs = data.filingStatus === 'MARRIED_FILING_SEPARATELY'
    ? overrides.spouseLivedTogetherForMfs ?? null
    : false;
  if (spouseLivedTogetherForMfs === null) {
    warnings.push('MFS living-together status is not confirmed because intake does not collect it; tax and IRMAA special-rule estimates are conservative illustrations only until an adviser selects true or false.');
  }
  return {
    asOfDate, clientName: persons.map((p) => p.name).join(' & '), filingStatus: data.filingStatus as PlanningInput['filingStatus'], maritalStatus: data.maritalStatus, state: data.state,
    persons, accounts, hypotheticalAnnuities: [], currentMonthlySpending: dollars(data.expenses.currentMonthly), retirementMonthlySpending: retirementMonthly, essentialMonthlySpending: essential,
    discretionaryMonthlySpending: data.expenses.discretionaryMonthly === '' ? (essential === null ? null : retirementMonthly - essential) : dollars(data.expenses.discretionaryMonthly),
    healthcareIncludedInSpending: overrides.healthcareIncludedInSpending ?? false, homeValue: dollars(data.home.value), mortgageBalance: dollars(data.home.mortgageBalance),
    mortgageMonthlyPayment: dollars(data.home.monthlyPayment), mortgagePayoffYear: optionalNumber(data.home.payoffYear),
    debts: data.debts.map((d) => ({ name: d.name, balance: dollars(d.balance), rate: Number(d.rate) / 100, monthlyPayment: dollars(d.monthlyPayment) })),
    goals: data.oneTimeGoals.map((g) => ({ name: g.item, amount: dollars(g.amount), year: Number(g.year) })), riskProfile, riskScore,
    allocation: data.allocation.status === 'KNOWN' ? { stocks: Number(data.allocation.stocksPercent) / 100, bonds: Number(data.allocation.bondsPercent) / 100, cash: Number(data.allocation.cashPercent) / 100 } : null,
    familyLongevity: yesNo(data.health.familyLongevity), currentHealthCoverage: data.health.currentCoverage || null, ltcInsured: yesNo(data.health.longTermCareInsurance),
    ltcDailyBenefit: data.health.longTermCareDailyBenefit === '' ? null : dollars(data.health.longTermCareDailyBenefit), disabilityInsured: yesNo(data.health.disabilityInsurance),
    legacyGoal: dollars(data.legacyAmount), annualCharity: dollars(data.annualCharity), dependents: Number(data.dependents), dependentsSpecialNeeds: data.dependentsSpecialNeeds === 'YES',
    estate: Object.fromEntries(Object.entries(data.estate).map(([key, v]) => [key, { status: v.status, updatedYear: optionalNumber(v.updatedYear) }])) as PlanningInput['estate'],
    historicalMagi: overrides.historicalMagi ?? {}, spouseLivedTogetherForMfs, warnings,
  };
}

function primaryPerson(input: PlanningInput): PlanningPerson {
  const person = input.persons.find((candidate) => candidate.role === 'PRIMARY');
  if (!person) throw new Error('Scenario inputs require a PRIMARY person.');
  return person;
}
function daysInYear(year: number): number { return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000; }
function anniversary(dob: string, age: number): number {
  const [birthYear, birthMonth, birthDay] = dob.split('-').map(Number);
  const year = birthYear + age;
  const finalDay = new Date(Date.UTC(year, birthMonth, 0)).getUTCDate();
  return Date.UTC(year, birthMonth - 1, Math.min(birthDay, finalDay));
}
function ltcExtraExpenses(input: PlanningInput, assumptions: PlanningAssumptions, event: z.infer<typeof ltcEventSchema>, warnings: string[]): Record<string, number> {
  const primary = primaryPerson(input);
  const currentAge = Math.floor(primary.ageMonths / 12);
  if (event.startAge <= currentAge) throw new Error('Scenario LTC event must begin after the planning as-of age; prior care costs are not reconstructed.');
  if (event.startAge > primary.planningAge) throw new Error('Scenario LTC event begins after the primary planning age and would not affect the projection.');
  const start = anniversary(primary.dob, event.startAge);
  const end = anniversary(primary.dob, event.startAge + event.durationYears);
  const startYear = new Date(start).getUTCFullYear();
  const endYear = new Date(end).getUTCFullYear();
  const result: Record<string, number> = {};
  for (let year = startYear; year <= endYear; year += 1) {
    const yearStart = Date.UTC(year, 0, 1);
    const yearEnd = Date.UTC(year + 1, 0, 1);
    const eligibleDays = Math.max(0, (Math.min(end, yearEnd) - Math.max(start, yearStart)) / 86_400_000);
    if (eligibleDays <= 0) continue;
    const gross = event.monthlyCost * 12 * Math.pow(1 + assumptions.healthcareInflation, year - assumptions.year) * (eligibleDays / daysInYear(year));
    const coverage = event.coverageDailyBenefit === undefined ? 0 : Math.min(gross, event.coverageDailyBenefit * eligibleDays);
    result[String(year)] = roundMoney(gross - coverage);
  }
  warnings.push(`Scenario LTC event is a supplied hypothetical cash outflow for the primary person beginning at age ${event.startAge}; it is included in cash flow and Monte Carlo, not treated as a claim prediction.`);
  if (event.coverageDailyBenefit === undefined) warnings.push('No LTC coverage offset was supplied for the scenario event; the advisor-entered gross care cost is modeled without estimating policy benefits.');
  else warnings.push('Scenario LTC coverage offset uses only the supplied level daily benefit; policy duration, elimination period, reimbursement terms, and inflation riders are not modeled.');
  return result;
}

function applyAccountOverride(input: PlanningInput, override: z.infer<typeof accountOverrideSchema>): void {
  const account = input.accounts.find((candidate) => candidate.owner === override.owner && candidate.type === override.type);
  if (!account) throw new Error(`Scenario account ${override.owner} ${override.type} is not present in the submitted plan and cannot be silently added.`);
  account.balance = roundMoney(override.balance);
  if (override.costBasis !== undefined) account.costBasis = override.costBasis === null ? null : roundMoney(override.costBasis);
  if (override.annuityQualification !== undefined) account.annuityQualification = override.annuityQualification;
  if (override.hsaQualified !== undefined) account.hsaQualified = override.hsaQualified;
}

function applyAnnuityPurchase(input: PlanningInput, purchase: z.infer<typeof hypotheticalAnnuitySchema>, warnings: string[]): void {
  const owner = input.persons.find((person) => person.role === purchase.owner);
  if (!owner) throw new Error(`Scenario annuity owner ${purchase.owner} is not in this household.`);
  const account = input.accounts.find((candidate) => candidate.owner === purchase.fundingAccount.owner && candidate.type === purchase.fundingAccount.type);
  if (!account) throw new Error('Scenario annuity funding account is not present in the submitted plan.');
  if (account.balance < purchase.premium) throw new Error('Scenario annuity premium exceeds the selected funding account balance.');
  const qualification = purchase.taxQualification === 'UNKNOWN' || purchase.taxQualification === undefined ? null : purchase.taxQualification;
  const qualifiedFunding = account.type === 'K401_PRETAX' || account.type === 'TRAD_IRA';
  const nonqualifiedFunding = account.type === 'CASH' || account.type === 'BROKERAGE';
  if (!qualifiedFunding && !nonqualifiedFunding) throw new Error('Scenario annuity funding must explicitly use an eligible pre-tax IRA/401(k), cash, or brokerage account; HSA, existing annuity, and life-insurance values are unsupported.');
  if (qualification === 'QUALIFIED' && !qualifiedFunding) throw new Error('A qualified hypothetical annuity must be funded from the selected pre-tax IRA or 401(k) account.');
  if (qualification === 'NONQUALIFIED' && !nonqualifiedFunding) throw new Error('A nonqualified hypothetical annuity must be funded from the selected cash or brokerage account.');
  if (account.type === 'BROKERAGE' && account.costBasis !== null) account.costBasis = roundMoney(account.costBasis * ((account.balance - purchase.premium) / account.balance));
  account.balance = roundMoney(account.balance - purchase.premium);
  (input.hypotheticalAnnuities ??= []).push({
    owner: purchase.owner,
    monthlyIncome: roundMoney(purchase.monthlyIncome),
    startAgeMonths: purchase.startAge * 12,
    taxQualification: qualification,
    premium: roundMoney(purchase.premium),
    fundingAccount: { ...purchase.fundingAccount },
  });
  warnings.push(`Scenario hypothetical annuity deducts the advisor-supplied premium from the explicitly selected ${purchase.fundingAccount.owner} ${purchase.fundingAccount.type} balance and adds only the advisor-supplied monthly income starting at age ${purchase.startAge}. It is not a carrier quote or guarantee.`);
  if (qualification === null) warnings.push('Scenario hypothetical annuity tax qualification is unknown. Its full payment is conservatively modeled as ordinary taxable income; payout taxation, exclusion ratio, and contract terms require confirmation.');
  else if (qualification === 'NONQUALIFIED') warnings.push('Scenario hypothetical annuity is marked nonqualified. Its full payment is conservatively modeled as ordinary taxable income because an exclusion ratio, basis recovery, and contract terms were not supplied.');
  else warnings.push('Scenario hypothetical annuity is marked qualified. Its full payment is modeled as ordinary taxable income; distribution eligibility, contract terms, and payout assumptions require confirmation.');
}

/** Applies only validated scenario controls to copies. Neither the Base input nor its assumptions are mutated. */
export function applyScenarioOverrides(baseInput: PlanningInput, baseAssumptions: PlanningAssumptions, overrides: ScenarioOverrides): EffectiveScenarioInput {
  const input = structuredClone(baseInput);
  const assumptions = structuredClone(baseAssumptions);
  const warnings: string[] = [];
  const people = overrides.people ?? {};
  for (const role of PERSON_ROLES) {
    const change = people[role];
    if (!change) continue;
    const person = input.persons.find((candidate) => candidate.role === role);
    if (!person) throw new Error(`Scenario includes ${role} changes, but this household has no ${role.toLowerCase()} person.`);
    const retirementAgeMonths = change.retirementAgeMonths ?? (change.retirementAge === undefined ? undefined : change.retirementAge * 12);
    if (retirementAgeMonths !== undefined) person.retirementAgeMonths = retirementAgeMonths;
    const claimAgeMonths = change.socialSecurityClaimAgeMonths ?? (change.socialSecurityClaimAge === undefined ? undefined : change.socialSecurityClaimAge * 12);
    if (claimAgeMonths !== undefined) {
      if (person.alreadyReceiving) throw new Error(`${role} is already receiving Social Security; a scenario cannot recompute or adjust an already-claimed benefit.`);
      person.claimAgeMonths = claimAgeMonths;
    }
    if (change.planningAge !== undefined) person.planningAge = change.planningAge;
    if (person.planningAge * 12 <= person.ageMonths) throw new Error(`${role} planning age must exceed the current age.`);
  }
  for (const account of overrides.accounts ?? []) applyAccountOverride(input, account);
  const spending = overrides.spending;
  if (spending?.currentMonthly !== undefined) input.currentMonthlySpending = roundMoney(spending.currentMonthly);
  if (spending?.retirementMonthly !== undefined) input.retirementMonthlySpending = roundMoney(spending.retirementMonthly);
  if (spending?.essentialMonthly !== undefined) input.essentialMonthlySpending = spending.essentialMonthly === null ? null : roundMoney(spending.essentialMonthly);
  if (spending?.annualCharity !== undefined) input.annualCharity = roundMoney(spending.annualCharity);
  if (spending?.healthcareIncluded !== undefined) input.healthcareIncludedInSpending = spending.healthcareIncluded;
  if (input.essentialMonthlySpending !== null && input.essentialMonthlySpending > input.retirementMonthlySpending) throw new Error('Scenario essential monthly spending cannot exceed scenario retirement monthly spending.');
  if (overrides.inflation) assumptions.inflation = overrides.inflation.annualRate;
  if (overrides.returns?.annualRate !== undefined) assumptions.returnByRisk[input.riskProfile] = overrides.returns.annualRate;
  const firstYear = Number(input.asOfDate.slice(0, 4));
  const lastYear = Math.max(...input.persons.map((person) => Number(person.dob.slice(0, 4)) + person.planningAge));
  const ensureWithinHorizon = (schedule: Record<string, number>, label: string) => {
    for (const year of Object.keys(schedule).map(Number)) {
      if (year < firstYear || year > lastYear) throw new Error(`${label} year ${year} is outside the active scenario projection horizon and would be ignored.`);
    }
  };
  if (overrides.rothSchedule) ensureWithinHorizon(overrides.rothSchedule, 'Roth conversion');
  if (overrides.returns?.returnByYear) ensureWithinHorizon(overrides.returns.returnByYear, 'Return override');
  const extraExpenses: Record<string, number> = {};
  if (overrides.ltcEvent) Object.assign(extraExpenses, ltcExtraExpenses(input, assumptions, overrides.ltcEvent, warnings));
  if (overrides.annuityPurchase) applyAnnuityPurchase(input, overrides.annuityPurchase, warnings);
  input.warnings = [...input.warnings, ...warnings];
  const engineOptions: AnalysisRunOptions = {
    cashFlow: {
      rothConversions: overrides.rothSchedule,
      returnByYear: overrides.returns?.returnByYear,
      extraExpenses: Object.keys(extraExpenses).length ? extraExpenses : undefined,
    },
    monteCarloMeanReturn: overrides.returns?.annualRate,
    warnings,
  };
  return { input, assumptions, engineOptions };
}

/** Build a scenario from raw intake while keeping `general` fully scoped to that scenario. */
export function mapScenarioPlanningInput(data: IntakeData, assumptions: PlanningAssumptions, asOfDate: string, overrides: ScenarioOverrides): EffectiveScenarioInput {
  const base = mapPlanningInput(data, assumptions, asOfDate, overrides.general ?? {});
  return applyScenarioOverrides(base, assumptions, overrides);
}
