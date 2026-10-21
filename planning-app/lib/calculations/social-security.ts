import { roundMoney, uniqueWarnings } from './math';
import type { ModuleMeta, PersonRole, PlanningAssumptions, PlanningInput, PlanningPerson } from './types';

const MONTHS_PER_YEAR = 12;
const EARLIEST_CLAIM_MONTHS = 62 * MONTHS_PER_YEAR;
const LATEST_DELAYED_CREDIT_MONTHS = 70 * MONTHS_PER_YEAR;
const POLICY_SOURCES = [
  'https://www.ssa.gov/benefits/retirement/planner/agereduction.html',
  'https://www.ssa.gov/benefits/retirement/planner/delayret.html',
  'https://www.ssa.gov/oact/quickcalc/spouse.html',
  'https://www.ssa.gov/benefits/retirement/planner/whileworking.html',
  'https://www.ssa.gov/benefits/retirement/planner/rule.html',
  'https://www.ssa.gov/survivor/amount',
  'https://www.ssa.gov/benefits/retirement/social-security-fairness-act.html',
];

export interface SocialSecurityPerson {
  role: PersonRole;
  name: string;
  fraMonths: number;
  at62: number;
  atFra: number;
  at70: number;
}

export interface SocialSecurityAnnualPoint {
  year: number;
  annual: number;
  cumulative: number;
  presentValue: number;
  withheld: number;
}

export interface SocialSecurityStrategy {
  claimAgesMonths: Partial<Record<PersonRole, number>>;
  cumulativeBenefits: number;
  presentValue: number;
  annualBenefits: SocialSecurityAnnualPoint[];
  warnings: string[];
  survivorModel: 'NO_SURVIVOR_EVENT' | 'SIMPLE_MAX_BENEFIT' | 'LIMITED';
}

export interface SocialSecurityCombination extends SocialSecurityStrategy {
  requestedClaimAgesMonths: Partial<Record<PersonRole, number>>;
  lockedClaimantRoles: PersonRole[];
}

export interface SocialSecurityCurves {
  at62: SocialSecurityAnnualPoint[];
  atFra: SocialSecurityAnnualPoint[];
  at70: SocialSecurityAnnualPoint[];
  combinations: SocialSecurityCombination[];
  breakEvenAges: Record<string, number | null>;
}

export interface HouseholdBenefitsAtYear {
  annual: number;
  monthly: number;
  /** Net annual benefit by role. These values sum to annual after withholding. */
  perPerson: Record<string, number>;
  withheld: number;
  warnings: string[];
}

export interface SocialSecurityResult {
  meta: ModuleMeta;
  people: SocialSecurityPerson[];
  planned: SocialSecurityStrategy;
  best: SocialSecurityStrategy;
  early: SocialSecurityStrategy;
  lifetimeDifference: number;
  survivorIncomeDropMonthly: number | null;
  curves: SocialSecurityCurves;
}

type BirthDate = { year: number; month: number | null; day: number | null };
type ClaimSelection = Record<PersonRole, number>;
type MonthlyCalculation = {
  amounts: Record<PersonRole, number>;
  withheld: Record<PersonRole, number>;
  warnings: string[];
  survivorModel: SocialSecurityStrategy['survivorModel'];
};
type Projection = SocialSecurityStrategy & { monthlyAmounts: number[] };

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite, non-negative number.`);
  return value;
}

function wholeMonths(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative whole number of months.`);
  return value;
}

function parseBirthDate(dob: string | number): BirthDate {
  if (typeof dob === 'number') {
    if (!Number.isInteger(dob) || dob < 1900 || dob > 2200) throw new Error('Birth year must be a whole year between 1900 and 2200.');
    return { year: dob, month: null, day: null };
  }
  if (dob.length === 4 && Number.isInteger(Number(dob))) return parseBirthDate(Number(dob));
  const parts = dob.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) throw new Error('Date of birth must be a YYYY-MM-DD date or birth year.');
  const [year, month, day] = parts;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) throw new Error('Date of birth is not a valid calendar date.');
  return { year, month, day };
}

/** SSA treats a January 1 birthday as belonging to the previous year for retirement FRA. */
export function getFullRetirementAgeMonths(dob: string | number): number {
  const birth = parseBirthDate(dob);
  const year = birth.month === 1 && birth.day === 1 ? birth.year - 1 : birth.year;
  if (year <= 1937) return 65 * MONTHS_PER_YEAR;
  if (year <= 1942) return 65 * MONTHS_PER_YEAR + (year - 1937) * 2;
  if (year <= 1954) return 66 * MONTHS_PER_YEAR;
  if (year <= 1959) return 66 * MONTHS_PER_YEAR + (year - 1954) * 2;
  return 67 * MONTHS_PER_YEAR;
}

/** Legal factors are retained through the calculation and only the payable monthly amount is cents-rounded half-up. */
export function calculateOwnBenefit(pia: number, fraMonths: number, claimMonths: number): number {
  finiteNonNegative(pia, 'PIA');
  wholeMonths(fraMonths, 'FRA');
  wholeMonths(claimMonths, 'Claim age');
  if (claimMonths < EARLIEST_CLAIM_MONTHS) throw new Error('Retirement benefits cannot start before age 62.');
  if (claimMonths < fraMonths) {
    const earlyMonths = fraMonths - claimMonths;
    const reduction = (Math.min(earlyMonths, 36) * (5 / 9) + Math.max(earlyMonths - 36, 0) * (5 / 12)) / 100;
    return roundMoney(pia * (1 - reduction));
  }
  const delayedMonths = Math.max(0, Math.min(claimMonths, LATEST_DELAYED_CREDIT_MONTHS) - fraMonths);
  return roundMoney(pia * (1 + (delayedMonths * (2 / 3)) / 100));
}

/** Returns the combined own-worker benefit and any separately reduced excess spouse benefit. */
export function calculateSpousalBenefit(args: {
  workerPia: number;
  ownPia: number;
  spouseFraMonths: number;
  spouseClaimMonths: number;
  ownClaimMonths?: number;
  workerFiled?: boolean;
}): number {
  const workerPia = finiteNonNegative(args.workerPia, 'Worker PIA');
  const ownPia = finiteNonNegative(args.ownPia, 'Own PIA');
  const spouseFraMonths = wholeMonths(args.spouseFraMonths, 'Spouse FRA');
  const spouseClaimMonths = wholeMonths(args.spouseClaimMonths, 'Spouse claim age');
  const ownClaimMonths = args.ownClaimMonths ?? spouseClaimMonths;
  const ownBenefit = calculateOwnBenefit(ownPia, spouseFraMonths, ownClaimMonths);
  if (args.workerFiled === false) return ownBenefit;
  const excess = Math.max(0, workerPia * 0.5 - ownPia);
  if (excess === 0) return ownBenefit;
  const earlyMonths = Math.max(0, spouseFraMonths - spouseClaimMonths);
  const reduction = (Math.min(earlyMonths, 36) * (25 / 36) + Math.max(earlyMonths - 36, 0) * (5 / 12)) / 100;
  return roundMoney(ownBenefit + roundMoney(excess * (1 - reduction)));
}

/** A simple, no-COLA break-even age in years; null means the later age does not improve the monthly benefit. */
export function breakEvenAge(pia: number, fraMonths: number, earlierMonths: number, laterMonths: number): number | null {
  finiteNonNegative(pia, 'PIA');
  wholeMonths(fraMonths, 'FRA');
  wholeMonths(earlierMonths, 'Earlier claim age');
  wholeMonths(laterMonths, 'Later claim age');
  if (laterMonths <= earlierMonths) return null;
  const earlier = calculateOwnBenefit(pia, fraMonths, earlierMonths);
  const later = calculateOwnBenefit(pia, fraMonths, laterMonths);
  if (later <= earlier) return null;
  return Number(((laterMonths + ((laterMonths - earlierMonths) * earlier) / (later - earlier)) / MONTHS_PER_YEAR).toFixed(2));
}

function monthIndex(year: number, monthOneBased: number): number { return year * MONTHS_PER_YEAR + monthOneBased - 1; }
function yearFromMonth(index: number): number { return Math.floor(index / MONTHS_PER_YEAR); }
function monthFromIndex(index: number): number { return (index % MONTHS_PER_YEAR) + 1; }

function monthIndexForDob(dob: string): number {
  const birth = parseBirthDate(dob);
  if (birth.month === null) throw new Error('A calendar date of birth is required for monthly Social Security timing.');
  return monthIndex(birth.year, birth.month);
}

function statutoryBirthMonthIndex(dob: string): number {
  const birth = parseBirthDate(dob);
  if (birth.month === null || birth.day === null) throw new Error('A calendar date of birth is required for monthly Social Security timing.');
  return monthIndex(birth.year, birth.month) - (birth.day === 1 ? 1 : 0);
}

/** At age 62, a claimant must be 62 for the entire entitlement month. */
function benefitStartMonthIndex(person: PlanningPerson, claimMonths: number): number {
  const birth = parseBirthDate(person.dob);
  if (birth.month === null || birth.day === null) throw new Error('A calendar date of birth is required for benefit-start timing.');
  return monthIndex(birth.year, birth.month) + claimMonths + (birth.day === 1 ? 0 : 1);
}

function fraMonthIndex(person: PlanningPerson, fraMonths: number): number { return statutoryBirthMonthIndex(person.dob) + fraMonths; }
function planningDeathMonthIndex(person: PlanningPerson): number {
  if (!Number.isInteger(person.planningAge) || person.planningAge < 0) throw new Error(`${person.name}: planning age must be a non-negative whole number.`);
  return monthIndexForDob(person.dob) + person.planningAge * MONTHS_PER_YEAR;
}

function baseYear(input: PlanningInput): number {
  const date = new Date(`${input.asOfDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || input.asOfDate.slice(0, 10) !== date.toISOString().slice(0, 10)) throw new Error('asOfDate must be a valid YYYY-MM-DD date.');
  return date.getUTCFullYear();
}

function asOfMonthIndex(input: PlanningInput): number {
  const date = new Date(`${input.asOfDate}T00:00:00Z`);
  return monthIndex(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

function validateAnnualSocialSecurity(assumptions: PlanningAssumptions): void {
  const rules = assumptions.annual?.socialSecurity;
  if (!rules) throw new Error('Planning assumptions must include annual Social Security rules.');
  finiteNonNegative(rules.earningsUnderFra, 'Annual earnings limit under FRA');
  finiteNonNegative(rules.earningsFraYear, 'Annual earnings limit in FRA year');
  if (!Number.isFinite(rules.cola) || rules.cola < -1 || rules.cola > 1) throw new Error('Annual Social Security COLA must be between -100% and 100%.');
}

function validateDiscountRate(assumptions: PlanningAssumptions): void {
  if (!Number.isFinite(assumptions.realDiscountRate) || assumptions.realDiscountRate <= -1 || assumptions.realDiscountRate > 1) throw new Error('Real discount rate must be greater than -100% and no greater than 100%.');
}

function colaFactor(assumptions: PlanningAssumptions, input: PlanningInput, year: number): number {
  return (1 + assumptions.annual.socialSecurity.cola) ** Math.max(0, year - baseYear(input));
}

function resolvedClaimAge(person: PlanningPerson, override: number | undefined): number {
  const fra = getFullRetirementAgeMonths(person.dob);
  if (person.alreadyReceiving) return person.benefitStartAgeMonths ?? fra;
  const claim = override ?? person.claimAgeMonths ?? fra;
  if (!Number.isInteger(claim) || claim < EARLIEST_CLAIM_MONTHS || claim > LATEST_DELAYED_CREDIT_MONTHS) throw new Error(`${person.name}: claim age must be a whole month from age 62 through age 70.`);
  return claim;
}

function buildClaimSelection(input: PlanningInput, overrides: Partial<Record<PersonRole, number>> = {}): ClaimSelection {
  const claims = {} as ClaimSelection;
  for (const person of input.persons) claims[person.role] = resolvedClaimAge(person, overrides[person.role]);
  return claims;
}

function isFiled(person: PlanningPerson, claimAge: number, input: PlanningInput, index: number): boolean {
  if (person.alreadyReceiving && person.benefitStartAgeMonths === null) return true;
  return index >= benefitStartMonthIndex(person, claimAge) && (person.alreadyReceiving || index >= asOfMonthIndex(input));
}

function monthlyOwnBenefit(person: PlanningPerson, claimAge: number, input: PlanningInput, assumptions: PlanningAssumptions, index: number, warnings: string[]): number {
  if (!isFiled(person, claimAge, input, index)) return 0;
  const year = yearFromMonth(index);
  if (person.alreadyReceiving) {
    if (person.currentBenefitMonthly !== null) {
      if (year < baseYear(input)) warnings.push(`${person.name}: current claimed benefit is supplied as of ${input.asOfDate}; prior-year benefit amounts are not reconstructed.`);
      return roundMoney(person.currentBenefitMonthly * colaFactor(assumptions, input, year));
    }
    if (person.benefitStartAgeMonths === null) {
      warnings.push(`${person.name}: current Social Security benefit and benefit-start age are missing; no already-claimed benefit can be modeled.`);
      return 0;
    }
    warnings.push(`${person.name}: current claimed benefit is missing; PIA and stated claim age reconstruct an estimate that may omit SSA recomputations or adjustments.`);
  }
  const base = calculateOwnBenefit(person.piaMonthly, getFullRetirementAgeMonths(person.dob), claimAge);
  return roundMoney(base * colaFactor(assumptions, input, year));
}

function monthlyAmounts(input: PlanningInput, assumptions: PlanningAssumptions, claims: ClaimSelection, index: number): MonthlyCalculation {
  const warnings: string[] = [];
  const amounts: Record<PersonRole, number> = { PRIMARY: 0, SPOUSE: 0 };
  const own: Record<PersonRole, number> = { PRIMARY: 0, SPOUSE: 0 };
  const underlyingOwn: Record<PersonRole, number> = { PRIMARY: 0, SPOUSE: 0 };
  const people = new Map(input.persons.map((person) => [person.role, person]));
  const primary = people.get('PRIMARY');
  const spouse = people.get('SPOUSE');

  for (const person of input.persons) {
    underlyingOwn[person.role] = monthlyOwnBenefit(person, claims[person.role], input, assumptions, index, warnings);
    if (index < planningDeathMonthIndex(person)) own[person.role] = underlyingOwn[person.role];
    amounts[person.role] = own[person.role];
  }

  let survivorModel: SocialSecurityStrategy['survivorModel'] = 'NO_SURVIVOR_EVENT';
  if (primary && spouse) {
    const primaryAlive = index < planningDeathMonthIndex(primary);
    const spouseAlive = index < planningDeathMonthIndex(spouse);
    if (primaryAlive && spouseAlive) {
      for (const [beneficiary, worker] of [[primary, spouse], [spouse, primary]] as const) {
        if (beneficiary.alreadyReceiving) {
          if (worker.piaMonthly > 0) warnings.push(`${beneficiary.name}: existing benefit is treated as the supplied total; an unrecorded spouse-benefit component is not added.`);
          continue;
        }
        if (isFiled(worker, claims[worker.role], input, index) && isFiled(beneficiary, claims[beneficiary.role], input, index)) {
          const combinedBase = calculateSpousalBenefit({
            workerPia: worker.piaMonthly,
            ownPia: beneficiary.piaMonthly,
            spouseFraMonths: getFullRetirementAgeMonths(beneficiary.dob),
            spouseClaimMonths: claims[beneficiary.role],
            ownClaimMonths: claims[beneficiary.role],
            workerFiled: true,
          });
          amounts[beneficiary.role] = roundMoney(combinedBase * colaFactor(assumptions, input, yearFromMonth(index)));
        }
      }
    } else if (primaryAlive !== spouseAlive) {
      const survivor = primaryAlive ? primary : spouse;
      const deceased = primaryAlive ? spouse : primary;
      const survivorFra = getFullRetirementAgeMonths(survivor.dob);
      const deceasedFiledBeforeDeath = isFiled(deceased, claims[deceased.role], input, planningDeathMonthIndex(deceased) - 1);
      if (own[survivor.role] > 0 && deceasedFiledBeforeDeath && underlyingOwn[deceased.role] > 0 && index >= fraMonthIndex(survivor, survivorFra)) {
        amounts[survivor.role] = Math.max(own[survivor.role], underlyingOwn[deceased.role]);
        survivorModel = 'SIMPLE_MAX_BENEFIT';
      } else {
        survivorModel = 'LIMITED';
        warnings.push(`${survivor.name}: survivor switch is not modeled before retirement FRA or without both benefits in payment; survivor filing age, survivor FRA, and reduction details are not supplied.`);
      }
    }
  }
  return { amounts, withheld: { PRIMARY: 0, SPOUSE: 0 }, warnings, survivorModel };
}

function annualEarnings(person: PlanningPerson, index: number): number {
  const retirementMonth = monthIndexForDob(person.dob) + person.retirementAgeMonths;
  if (index < retirementMonth) return finiteNonNegative(person.earnedIncomeAnnual, `${person.name} earned income`);
  const end = person.partTimeEndAgeMonths === null ? Number.POSITIVE_INFINITY : monthIndexForDob(person.dob) + person.partTimeEndAgeMonths;
  return index <= end ? finiteNonNegative(person.partTimeAnnual, `${person.name} part-time income`) : 0;
}

function earningsWithholding(person: PlanningPerson, claimAge: number, annualGross: number, preFraGross: number, input: PlanningInput, assumptions: PlanningAssumptions, year: number, warnings: string[]): number {
  if (annualGross <= 0) return 0;
  const fra = getFullRetirementAgeMonths(person.dob);
  const fraIndex = fraMonthIndex(person, fra);
  const start = monthIndex(year, 1);
  if (fraIndex < start) return 0;
  if (assumptions.annual.year !== year) {
    if (annualEarnings(person, start) > 0) warnings.push(`${person.name}: earnings-test withholding is not modeled for ${year}; only annual SSA rules for ${assumptions.annual.year} were supplied.`);
    return 0;
  }
  const earnings = annualEarnings(person, start);
  if (earnings <= 0) return 0;
  const benefitStart = benefitStartMonthIndex(person, claimAge);
  if (benefitStart >= start && benefitStart < start + MONTHS_PER_YEAR) {
    warnings.push(`${person.name}: SSA's first-year special monthly earnings rule is not modeled because monthly earnings and self-employment service hours are not supplied.`);
  }
  let target = 0;
  if (fraIndex >= start + MONTHS_PER_YEAR) {
    target = Math.max(0, (earnings - assumptions.annual.socialSecurity.earningsUnderFra) / 2);
  } else {
    const preFraMonths = Math.max(0, fraIndex - start);
    const preFraEarnings = earnings * (preFraMonths / MONTHS_PER_YEAR);
    target = Math.max(0, (preFraEarnings - assumptions.annual.socialSecurity.earningsFraYear) / 3);
    warnings.push(`${person.name}: FRA-year earnings are uniformly annualized across ${preFraMonths} month(s) before FRA because monthly wages are not supplied; the withholding is an estimate.`);
  }
  const withheld = roundMoney(Math.min(target, preFraGross));
  if (withheld > 0) warnings.push(`${person.name}: Social Security benefits are reduced for the annual earnings test; withheld payments are not a permanent benefit loss.`);
  return withheld;
}

type AnnualRaw = { gross: Record<PersonRole, number>; preFraGross: Record<PersonRole, number>; warnings: string[]; survivorModel: SocialSecurityStrategy['survivorModel'] };

function emptyAnnualRaw(): AnnualRaw {
  return { gross: { PRIMARY: 0, SPOUSE: 0 }, preFraGross: { PRIMARY: 0, SPOUSE: 0 }, warnings: [], survivorModel: 'NO_SURVIVOR_EVENT' };
}

function rawBenefitsForMonths(input: PlanningInput, assumptions: PlanningAssumptions, claims: ClaimSelection, startIndex: number, endIndex: number): Map<number, AnnualRaw> {
  const byYear = new Map<number, AnnualRaw>();
  for (let index = startIndex; index <= endIndex; index += 1) {
    const year = yearFromMonth(index);
    const raw = byYear.get(year) ?? emptyAnnualRaw();
    const monthly = monthlyAmounts(input, assumptions, claims, index);
    raw.warnings.push(...monthly.warnings);
    if (monthly.survivorModel === 'LIMITED') raw.survivorModel = 'LIMITED';
    else if (monthly.survivorModel === 'SIMPLE_MAX_BENEFIT' && raw.survivorModel === 'NO_SURVIVOR_EVENT') raw.survivorModel = 'SIMPLE_MAX_BENEFIT';
    for (const person of input.persons) {
      const amount = monthly.amounts[person.role];
      raw.gross[person.role] += amount;
      if (index < fraMonthIndex(person, getFullRetirementAgeMonths(person.dob))) raw.preFraGross[person.role] += amount;
    }
    byYear.set(year, raw);
  }
  return byYear;
}

function annualResultFromRaw(input: PlanningInput, assumptions: PlanningAssumptions, claims: ClaimSelection, year: number, raw: AnnualRaw): HouseholdBenefitsAtYear {
  const warnings = [...raw.warnings];
  const perPerson: Record<string, number> = {};
  let withheld = 0;
  for (const person of input.persons) {
    const gross = roundMoney(raw.gross[person.role]);
    const reduction = earningsWithholding(person, claims[person.role], gross, roundMoney(raw.preFraGross[person.role]), input, assumptions, year, warnings);
    perPerson[person.role] = roundMoney(gross - reduction);
    withheld = roundMoney(withheld + reduction);
  }
  const annual = roundMoney(Object.values(perPerson).reduce((sum, amount) => sum + amount, 0));
  return { annual, monthly: roundMoney(annual / MONTHS_PER_YEAR), perPerson, withheld, warnings: uniqueWarnings(warnings) };
}

/**
 * Returns a calendar-year household benefit. `annual` and each `perPerson` value are net of
 * annual earnings-test withholding; `monthly` is the calendar-year average (annual divided by 12).
 */
export function householdBenefitsAtYear(
  input: PlanningInput,
  assumptions: PlanningAssumptions,
  year: number,
  claimOverrides: Partial<Record<'PRIMARY' | 'SPOUSE', number>> = {},
): HouseholdBenefitsAtYear {
  validateAnnualSocialSecurity(assumptions);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new Error('Benefit year must be a whole calendar year between 1900 and 2200.');
  const claims = buildClaimSelection(input, claimOverrides);
  const raw = rawBenefitsForMonths(input, assumptions, claims, monthIndex(year, 1), monthIndex(year, 12));
  const result = annualResultFromRaw(input, assumptions, claims, year, raw.get(year) ?? emptyAnnualRaw());
  if (year > baseYear(input)) result.warnings = uniqueWarnings([
    ...result.warnings,
    `Benefits after ${baseYear(input)} use the supplied annual Social Security COLA as an explicit planning projection, not future verified law.`,
  ]);
  return result;
}

function projectStrategy(input: PlanningInput, assumptions: PlanningAssumptions, overrides: Partial<Record<PersonRole, number>> = {}): Projection {
  const claims = buildClaimSelection(input, overrides);
  const start = asOfMonthIndex(input);
  const end = Math.max(...input.persons.map(planningDeathMonthIndex)) - 1;
  const rawByYear = end >= start ? rawBenefitsForMonths(input, assumptions, claims, start, end) : new Map<number, AnnualRaw>();
  const annualBenefits: SocialSecurityAnnualPoint[] = [];
  const warnings: string[] = [];
  const monthlyAmounts: number[] = [];
  let cumulative = 0;
  let presentValue = 0;
  let survivorModel: SocialSecurityStrategy['survivorModel'] = 'NO_SURVIVOR_EVENT';

  for (const [year, raw] of [...rawByYear.entries()].sort(([a], [b]) => a - b)) {
    const annual = annualResultFromRaw(input, assumptions, claims, year, raw);
    cumulative = roundMoney(cumulative + annual.annual);
    const discounted = annual.annual / ((1 + assumptions.realDiscountRate) ** (year - baseYear(input) + 0.5));
    presentValue = roundMoney(presentValue + discounted);
    annualBenefits.push({ year, annual: annual.annual, cumulative, presentValue, withheld: annual.withheld });
    warnings.push(...annual.warnings);
    if (raw.survivorModel === 'LIMITED') survivorModel = 'LIMITED';
    else if (raw.survivorModel === 'SIMPLE_MAX_BENEFIT' && survivorModel === 'NO_SURVIVOR_EVENT') survivorModel = 'SIMPLE_MAX_BENEFIT';
  }
  for (let index = start; index <= end; index += 1) {
    const calculation = monthlyAmountsForProjection(input, assumptions, claims, index);
    monthlyAmounts.push(roundMoney(Object.values(calculation.amounts).reduce((sum, amount) => sum + amount, 0)));
  }
  if (annualBenefits.some((point) => point.year > baseYear(input))) {
    warnings.push(`Benefits after ${baseYear(input)} repeat the supplied annual Social Security COLA as a planning projection rather than future verified law.`);
  }
  return {
    claimAgesMonths: claims,
    cumulativeBenefits: cumulative,
    presentValue,
    annualBenefits,
    warnings: uniqueWarnings(warnings),
    survivorModel,
    monthlyAmounts,
  };
}

/** Exists to keep projection use explicit at the strategy boundary. */
function monthlyAmountsForProjection(input: PlanningInput, assumptions: PlanningAssumptions, claims: ClaimSelection, index: number): MonthlyCalculation {
  return monthlyAmounts(input, assumptions, claims, index);
}

function candidateAges(): number[] { return Array.from({ length: 9 }, (_, index) => EARLIEST_CLAIM_MONTHS + index * MONTHS_PER_YEAR); }

function candidateCombinations(input: PlanningInput, assumptions: PlanningAssumptions): SocialSecurityCombination[] {
  const primary = input.persons.find((person) => person.role === 'PRIMARY');
  const spouse = input.persons.find((person) => person.role === 'SPOUSE');
  if (!primary) throw new Error('Planning input must include a PRIMARY person.');
  const choices = candidateAges();
  const combinations: SocialSecurityCombination[] = [];
  const spouseChoices = spouse ? choices : [undefined];
  for (const requestedPrimary of choices) {
    for (const requestedSpouse of spouseChoices) {
      const requested: Partial<Record<PersonRole, number>> = { PRIMARY: requestedPrimary };
      if (requestedSpouse !== undefined) requested.SPOUSE = requestedSpouse;
      const overrides: Partial<Record<PersonRole, number>> = {};
      if (!primary.alreadyReceiving) overrides.PRIMARY = requestedPrimary;
      if (spouse && !spouse.alreadyReceiving && requestedSpouse !== undefined) overrides.SPOUSE = requestedSpouse;
      const projection = projectStrategy(input, assumptions, overrides);
      combinations.push({
        ...projection,
        requestedClaimAgesMonths: requested,
        lockedClaimantRoles: input.persons.filter((person) => person.alreadyReceiving).map((person) => person.role),
      });
    }
  }
  return combinations;
}

function betterStrategy(a: SocialSecurityCombination, b: SocialSecurityCombination): SocialSecurityCombination {
  if (b.presentValue !== a.presentValue) return b.presentValue > a.presentValue ? b : a;
  if (b.cumulativeBenefits !== a.cumulativeBenefits) return b.cumulativeBenefits > a.cumulativeBenefits ? b : a;
  const aPrimary = a.claimAgesMonths.PRIMARY ?? Number.POSITIVE_INFINITY;
  const bPrimary = b.claimAgesMonths.PRIMARY ?? Number.POSITIVE_INFINITY;
  if (bPrimary !== aPrimary) return bPrimary < aPrimary ? b : a;
  const aSpouse = a.claimAgesMonths.SPOUSE ?? Number.POSITIVE_INFINITY;
  const bSpouse = b.claimAgesMonths.SPOUSE ?? Number.POSITIVE_INFINITY;
  return bSpouse < aSpouse ? b : a;
}

function strategyOnly(strategy: SocialSecurityStrategy): SocialSecurityStrategy {
  const { claimAgesMonths, cumulativeBenefits, presentValue, annualBenefits, warnings, survivorModel } = strategy;
  return { claimAgesMonths, cumulativeBenefits, presentValue, annualBenefits, warnings, survivorModel };
}

function survivorIncomeDrop(input: PlanningInput, assumptions: PlanningAssumptions, planned: SocialSecurityStrategy): number | null {
  const primary = input.persons.find((person) => person.role === 'PRIMARY');
  const spouse = input.persons.find((person) => person.role === 'SPOUSE');
  if (!primary || !spouse) return null;
  const claims = planned.claimAgesMonths as ClaimSelection;
  const start = asOfMonthIndex(input);
  const end = Math.min(planningDeathMonthIndex(primary), planningDeathMonthIndex(spouse)) - 1;
  for (let index = start; index <= end; index += 1) {
    const amounts = monthlyAmounts(input, assumptions, claims, index).amounts;
    if (amounts.PRIMARY > 0 && amounts.SPOUSE > 0) return roundMoney(Math.min(amounts.PRIMARY, amounts.SPOUSE));
  }
  return null;
}

export function calculateSocialSecurity(input: PlanningInput, assumptions: PlanningAssumptions): SocialSecurityResult {
  validateAnnualSocialSecurity(assumptions);
  validateDiscountRate(assumptions);
  if (input.persons.length === 0 || input.persons.length > 2) throw new Error('Social Security calculations require one primary person and, optionally, one spouse.');
  const people = input.persons.map((person) => {
    const fraMonths = getFullRetirementAgeMonths(person.dob);
    return {
      role: person.role,
      name: person.name,
      fraMonths,
      at62: calculateOwnBenefit(person.piaMonthly, fraMonths, EARLIEST_CLAIM_MONTHS),
      atFra: calculateOwnBenefit(person.piaMonthly, fraMonths, fraMonths),
      at70: calculateOwnBenefit(person.piaMonthly, fraMonths, LATEST_DELAYED_CREDIT_MONTHS),
    };
  });
  const planned = projectStrategy(input, assumptions);
  const early = projectStrategy(input, assumptions, Object.fromEntries(input.persons.filter((person) => !person.alreadyReceiving).map((person) => [person.role, EARLIEST_CLAIM_MONTHS])) as Partial<Record<PersonRole, number>>);
  const atFra = projectStrategy(input, assumptions, Object.fromEntries(input.persons.filter((person) => !person.alreadyReceiving).map((person) => [person.role, getFullRetirementAgeMonths(person.dob)])) as Partial<Record<PersonRole, number>>);
  const at70 = projectStrategy(input, assumptions, Object.fromEntries(input.persons.filter((person) => !person.alreadyReceiving).map((person) => [person.role, LATEST_DELAYED_CREDIT_MONTHS])) as Partial<Record<PersonRole, number>>);
  const combinations = candidateCombinations(input, assumptions);
  const bestCandidate = combinations.reduce(betterStrategy);
  const best = strategyOnly(bestCandidate);
  const warnings = uniqueWarnings([
    ...planned.warnings,
    ...best.warnings,
    ...early.warnings,
    ...input.persons.filter((person) => person.alreadyReceiving).map((person) => `${person.name}: benefit is already claimed and remains locked in all claiming alternatives.`),
    ...input.persons.filter((person) => person.governmentNoncoveredPension).map((person) => `${person.name}: the noncovered-pension flag is informational; WEP/GPO are not applied.`),
    ...input.persons.filter((person) => person.earnedIncomeAnnual > 0 || person.partTimeAnnual > 0).map((person) => `${person.name}: potential benefit recomputation from later high earnings is not modeled because historical covered-earnings records are unavailable.`),
  ]);
  const annualSources = [...(assumptions.annual.sources ?? []), ...(assumptions.sources ?? [])].map((source) => source.url).filter(Boolean);
  return {
    meta: { status: warnings.length > 0 ? 'PARTIAL' : 'COMPLETE', warnings, sources: uniqueWarnings([...annualSources, ...POLICY_SOURCES]) },
    people,
    planned: strategyOnly(planned),
    best,
    early: strategyOnly(early),
    lifetimeDifference: roundMoney(best.cumulativeBenefits - planned.cumulativeBenefits),
    survivorIncomeDropMonthly: survivorIncomeDrop(input, assumptions, planned),
    curves: {
      at62: early.annualBenefits,
      atFra: atFra.annualBenefits,
      at70: at70.annualBenefits,
      combinations,
      breakEvenAges: Object.fromEntries(input.persons.flatMap((person) => {
        const fra = getFullRetirementAgeMonths(person.dob);
        return [
          [`${person.role}_62_VS_FRA`, breakEvenAge(person.piaMonthly, fra, EARLIEST_CLAIM_MONTHS, fra)],
          [`${person.role}_FRA_VS_70`, breakEvenAge(person.piaMonthly, fra, fra, LATEST_DELAYED_CREDIT_MONTHS)],
        ];
      })),
    },
  };
}
