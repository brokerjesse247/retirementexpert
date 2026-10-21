import type {
  AnnualRules,
  FilingStatus,
  IrmaaTier,
  MfsLivingTogetherTreatment,
  ModuleMeta,
  PersonRole,
  PlanningAssumptions,
  PlanningInput,
} from './types';
import { ageAtYear, roundMoney, uniqueWarnings } from './math';

const CMS_2026_PREMIUMS_URL = 'https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-deductibles';
const MEDICARE_ENROLLMENT_URL = 'https://www.medicare.gov/basics/get-started-with-medicare/sign-up/when-does-medicare-coverage-start';
const IRS_HSA_URL = 'https://www.irs.gov/publications/p969';
const UNKNOWN_MFS_IRMAA_WARNING = 'MFS living-together status is not confirmed; the applicable IRMAA table is unavailable. Where MAGI is supplied, the special MFS table is shown as a conservative illustration only. An adviser must confirm whether the spouses lived together at any point in the tax year.';

export interface MedicarePremium {
  partBMonthly: number;
  /** This is the Part D IRMAA surcharge. A plan premium belongs in the supplemental assumption. */
  partDMonthly: number;
  /** Zero-based IRMAA tier index from the applicable annual rules table. */
  tier: number;
}

export interface HealthcarePersonCost extends Record<string, unknown> {
  role: PersonRole;
  name: string;
  age: number;
  coverage: 'PRE_MEDICARE' | 'MEDICARE';
  annual: number;
  projected: boolean;
  partBMonthly: number | null;
  /** Part D IRMAA surcharge only; the Part D plan premium is not added a second time. */
  partDMonthly: number | null;
  supplementalMonthly: number | null;
  outOfPocketAnnual: number | null;
  hsaEligiblePremiumAnnual: number | null;
  magiLookbackYear: number | null;
  magiUsed: number | null;
  magiSource: 'SUPPLIED' | 'UNAVAILABLE' | null;
  irmaaTier: number | null;
  /** Discloses whether an MFS IRMAA table was confirmed or conservatively illustrated. */
  irmaaMfsLivingTogetherTreatment: MfsLivingTogetherTreatment | null;
}

export interface HealthcareYearResult {
  annual: number;
  warnings: string[];
  people: HealthcarePersonCost[];
}

export interface HealthcareProjectionRow {
  year: number;
  annual: number;
  presentValue: number;
  people: HealthcarePersonCost[];
  warnings: string[];
}

export interface HealthcarePersonSummary extends Record<string, unknown> {
  role: PersonRole;
  name: string;
  medicareStartYear: number;
  preMedicareGapYears: number;
  lifetimeFutureCost: number;
  lifetimePresentCost: number;
}

export interface HealthcareCalculation extends ModuleMeta {
  people: HealthcarePersonSummary[];
  rows: HealthcareProjectionRow[];
  lifetimeFutureCost: number;
  lifetimePresentCost: number;
  /** Estimated years known qualifying Medicare premiums can be paid from owner-eligible HSA balances. */
  hsaCoverageYears: number | null;
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1e12) {
    throw new Error(`${label} must be a finite non-negative amount.`);
  }
}

function assertRate(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be a finite rate from 0 through 1.`);
  }
}

function mfsLivingTogetherTreatment(
  filingStatus: FilingStatus,
  separateLivedTogether: boolean | null | undefined,
): MfsLivingTogetherTreatment {
  if (filingStatus !== 'MARRIED_FILING_SEPARATELY') return 'NOT_APPLICABLE';
  if (separateLivedTogether === true) return 'CONFIRMED_LIVED_TOGETHER';
  if (separateLivedTogether === false) return 'CONFIRMED_LIVED_APART';
  // The special table is the bounded conservative illustration; the returned
  // HealthcarePersonCost continues to expose that the fact itself is unknown.
  return 'UNKNOWN_CONSERVATIVE_LIVED_TOGETHER';
}

function applicableIrmaaTiers(
  filingStatus: FilingStatus,
  rules: AnnualRules,
  treatment: MfsLivingTogetherTreatment,
): IrmaaTier[] {
  if (filingStatus === 'MARRIED_FILING_JOINTLY') return rules.medicare.irmaaJoint;

  // CMS uses its separate-return table only where spouses lived together at any point
  // in the taxable year. An unconfirmed fact uses that table only as a disclosed,
  // conservative illustration; a separately filing person confirmed to have lived
  // apart uses individual tiers.
  if (filingStatus === 'MARRIED_FILING_SEPARATELY' && treatment !== 'CONFIRMED_LIVED_APART') {
    return rules.medicare.irmaaSeparate;
  }

  return rules.medicare.irmaaSingle;
}

function tierForMagi(magi: number, tiers: IrmaaTier[]): { tier: IrmaaTier; index: number } {
  if (tiers.length === 0) throw new Error('Medicare IRMAA tiers are required.');

  for (let index = 0; index < tiers.length; index += 1) {
    const tier = tiers[index];
    if (tier.upTo === null) return { tier, index };
    assertNonNegativeFinite(tier.upTo, `Medicare IRMAA tier ${index} threshold`);
    if (tier.upperExclusive ? magi < tier.upTo : magi <= tier.upTo) return { tier, index };
  }

  throw new Error('Medicare IRMAA tiers require an open-ended final tier.');
}

/**
 * Selects the income-related Medicare premium for the supplied annual rule set.
 * `separateLivedTogether` means that an MFS filer lived with their spouse during the
 * relevant tax year; a null fact uses the special MFS tier only as a labeled,
 * conservative illustration rather than as a confirmed household fact.
 */
export function calculateMedicarePremium(
  magi: number,
  filingStatus: FilingStatus,
  rules: AnnualRules,
  separateLivedTogether?: boolean | null,
): MedicarePremium {
  assertNonNegativeFinite(magi, 'MAGI');
  assertNonNegativeFinite(rules.medicare.partBStandard, 'Medicare Part B standard premium');

  const treatment = mfsLivingTogetherTreatment(filingStatus, separateLivedTogether);
  const selected = tierForMagi(magi, applicableIrmaaTiers(filingStatus, rules, treatment));
  assertNonNegativeFinite(selected.tier.partBMonthly, `Medicare Part B tier ${selected.index} premium`);
  assertNonNegativeFinite(selected.tier.partDMonthly, `Medicare Part D tier ${selected.index} surcharge`);

  return {
    partBMonthly: roundMoney(selected.tier.partBMonthly),
    partDMonthly: roundMoney(selected.tier.partDMonthly),
    tier: selected.index,
  };
}

function planningYear(value: string): number {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(value);
  if (!match) throw new Error('asOfDate must be a YYYY-MM-DD date.');
  const year = Number(match[1]);
  if (!Number.isInteger(year) || year < 1900 || year > 9999) throw new Error('asOfDate has an unsupported year.');
  return year;
}

function birthYear(dob: string): number {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(dob);
  if (!match) throw new Error('Person date of birth must be a YYYY-MM-DD date.');
  return Number(match[1]);
}

function inflationFactor(year: number, assumptions: PlanningAssumptions): number {
  assertRate(assumptions.healthcareInflation, 'Healthcare inflation');
  const elapsedYears = year - assumptions.annual.year;
  const factor = Math.pow(1 + assumptions.healthcareInflation, elapsedYears);
  if (!Number.isFinite(factor) || factor <= 0) throw new Error('Healthcare inflation projection is outside supported range.');
  return factor;
}

function suppliedMagi(
  input: PlanningInput,
  historicalMagi: Record<string, number> | undefined,
  lookbackYear: number,
): number | null {
  const history = historicalMagi === undefined ? input.historicalMagi : historicalMagi;
  const candidate = history?.[String(lookbackYear)];
  if (candidate === undefined || candidate === null) return null;
  assertNonNegativeFinite(candidate, `Historical MAGI for ${lookbackYear}`);
  return candidate;
}

/**
 * Calculates annual healthcare costs for people within their stated planning horizon.
 * Medicare premium selection always uses MAGI from exactly two years before `year`.
 * A caller such as the cash-flow engine can pass its own historical/projected MAGI map.
 */
export function healthcareCostAtYear(
  input: PlanningInput,
  assumptions: PlanningAssumptions,
  year: number,
  historicalMagi?: Record<string, number>,
): HealthcareYearResult {
  if (!Number.isInteger(year) || year < 1900 || year > 9999) throw new Error('Healthcare projection year is invalid.');
  assertNonNegativeFinite(assumptions.preMedicareMonthly, 'Pre-Medicare monthly cost assumption');
  assertNonNegativeFinite(assumptions.supplementalMedicareMonthly, 'Supplemental Medicare monthly cost assumption');
  assertNonNegativeFinite(assumptions.medicalOutOfPocketAnnual, 'Medical out-of-pocket annual cost assumption');
  assertNonNegativeFinite(assumptions.annual.medicare.partBStandard, 'Medicare Part B standard premium');

  const warnings: string[] = [];
  const irmaaMfsLivingTogetherTreatment = mfsLivingTogetherTreatment(input.filingStatus, input.spouseLivedTogetherForMfs);
  if (irmaaMfsLivingTogetherTreatment === 'UNKNOWN_CONSERVATIVE_LIVED_TOGETHER') {
    warnings.push(UNKNOWN_MFS_IRMAA_WARNING);
  }
  const factor = inflationFactor(year, assumptions);
  const projected = year !== assumptions.annual.year;
  if (projected) {
    warnings.push(`${year} healthcare costs are planning projections indexed from ${assumptions.annual.year} at the healthcare-inflation assumption; they are not official future Medicare premiums.`);
  }
  if (year < assumptions.annual.year) {
    warnings.push(`${year} uses a back-cast of the ${assumptions.annual.year} healthcare rule set rather than verified historical premiums.`);
  }

  const people: HealthcarePersonCost[] = [];
  for (const person of input.persons) {
    const age = ageAtYear(person.dob, year);
    if (age > person.planningAge) continue;

    if (age < 65) {
      const monthly = roundMoney(assumptions.preMedicareMonthly * factor);
      const annual = roundMoney(monthly * 12);
      if (!input.currentHealthCoverage) {
        warnings.push(`${person.name}: coverage before Medicare is unknown; the pre-Medicare planning assumption is used, not a carrier quote.`);
      }
      people.push({
        role: person.role,
        name: person.name,
        age,
        coverage: 'PRE_MEDICARE',
        annual,
        projected,
        partBMonthly: null,
        partDMonthly: null,
        supplementalMonthly: null,
        outOfPocketAnnual: null,
        hsaEligiblePremiumAnnual: null,
        magiLookbackYear: null,
        magiUsed: null,
        magiSource: null,
        irmaaTier: null,
        irmaaMfsLivingTogetherTreatment: null,
      });
      continue;
    }

    const lookbackYear = year - 2;
    const lookbackMagi = suppliedMagi(input, historicalMagi, lookbackYear);
    const premium = lookbackMagi === null
      ? { partBMonthly: roundMoney(assumptions.annual.medicare.partBStandard), partDMonthly: 0, tier: 0 }
      : calculateMedicarePremium(
        lookbackMagi,
        input.filingStatus,
        assumptions.annual,
        input.spouseLivedTogetherForMfs,
      );
    if (lookbackMagi === null) {
      warnings.push(`No supplied MAGI for ${lookbackYear}; ${person.name}'s ${year} Medicare estimate uses the standard Part B tier and no Part D IRMAA rather than inventing a two-year lookback.`);
    }

    // SupplementalMedicareMonthly is explicitly the combined Medigap/Medicare Advantage
    // and Part D coverage assumption. Only the government Part D IRMAA surcharge is added.
    const partBMonthly = roundMoney(premium.partBMonthly * factor);
    const partDMonthly = roundMoney(premium.partDMonthly * factor);
    const supplementalMonthly = roundMoney(assumptions.supplementalMedicareMonthly * factor);
    const outOfPocketAnnual = roundMoney(assumptions.medicalOutOfPocketAnnual * factor);
    const annual = roundMoney((partBMonthly + partDMonthly + supplementalMonthly) * 12 + outOfPocketAnnual);

    people.push({
      role: person.role,
      name: person.name,
      age,
      coverage: 'MEDICARE',
      annual,
      projected,
      partBMonthly,
      partDMonthly,
      supplementalMonthly,
      outOfPocketAnnual,
      // Medigap cannot be counted: the supplemental input blends Medigap/MA/Part D,
      // so it is conservatively excluded until component-level premium data is available.
      hsaEligiblePremiumAnnual: roundMoney((partBMonthly + partDMonthly) * 12),
      magiLookbackYear: lookbackYear,
      magiUsed: lookbackMagi,
      magiSource: lookbackMagi === null ? 'UNAVAILABLE' : 'SUPPLIED',
      irmaaTier: lookbackMagi === null ? null : premium.tier,
      irmaaMfsLivingTogetherTreatment,
    });
  }

  return {
    annual: roundMoney(people.reduce((sum, person) => sum + person.annual, 0)),
    warnings: uniqueWarnings(warnings),
    people,
  };
}

function presentValue(nominalAmount: number, year: number, assumptions: PlanningAssumptions): number {
  assertRate(assumptions.realDiscountRate, 'Real discount rate');
  const elapsedYears = year - assumptions.annual.year;
  const nominalDiscount = Math.pow(
    (1 + assumptions.healthcareInflation) * (1 + assumptions.realDiscountRate),
    elapsedYears,
  );
  if (!Number.isFinite(nominalDiscount) || nominalDiscount <= 0) throw new Error('Healthcare present-value discount is outside supported range.');
  return roundMoney(nominalAmount / nominalDiscount);
}

function hsaCoverageYears(
  input: PlanningInput,
  assumptions: PlanningAssumptions,
  startYear: number,
  endYear: number,
  warnings: string[],
): number | null {
  const hsaAccounts = input.accounts.filter((account) => account.type === 'HSA' && account.balance > 0);
  if (hsaAccounts.length === 0) return 0;

  let eligibleHsaBalance = 0;
  let qualifyingPremiums = 0;
  for (const person of input.persons) {
    const medicareStartYear = Math.max(startYear, birthYear(person.dob) + 65);
    if (medicareStartYear > endYear || medicareStartYear > birthYear(person.dob) + person.planningAge) continue;

    const ownerBalance = hsaAccounts
      .filter((account) => account.owner === person.role)
      .reduce((sum, account) => sum + account.balance, 0);
    if (ownerBalance === 0) continue;

    const cost = healthcareCostAtYear(input, assumptions, medicareStartYear);
    const personCost = cost.people.find((entry) => entry.role === person.role);
    if (!personCost || personCost.coverage !== 'MEDICARE' || personCost.hsaEligiblePremiumAnnual === null) continue;

    eligibleHsaBalance += ownerBalance;
    qualifyingPremiums += personCost.hsaEligiblePremiumAnnual;
    if (input.accounts.some((account) => account.type === 'HSA' && account.owner === person.role && account.hsaQualified !== true)) {
      warnings.push(`${person.name}: HSA qualified-use status is not confirmed; HSA coverage years are an estimate and require tax review.`);
    }
  }

  if (eligibleHsaBalance === 0 || qualifyingPremiums === 0) {
    warnings.push('No owner-eligible Medicare HSA premium amount falls within the planning horizon; HSA Medicare-premium coverage years cannot be estimated.');
    return null;
  }

  warnings.push('HSA coverage years count known Medicare Part B and Part D IRMAA premiums only. The combined supplemental assumption is excluded because Medigap premiums are not qualified HSA expenses.');
  return roundMoney(eligibleHsaBalance / qualifyingPremiums);
}

/**
 * Produces an annual healthcare projection through each person’s planning age.
 * Future Medicare values are explicit indexed projections of the annual base rule,
 * while plan premium, supplemental coverage, and out-of-pocket values remain planning assumptions.
 */
export function calculateHealthcare(input: PlanningInput, assumptions: PlanningAssumptions): HealthcareCalculation {
  const startYear = planningYear(input.asOfDate);
  const endYear = Math.max(...input.persons.map((person) => birthYear(person.dob) + person.planningAge));
  if (endYear < startYear) throw new Error('No healthcare projection years remain within the planning horizon.');
  if (endYear - startYear > 150) throw new Error('Healthcare projection exceeds the supported planning horizon.');

  const warnings: string[] = [];
  if (mfsLivingTogetherTreatment(input.filingStatus, input.spouseLivedTogetherForMfs) === 'UNKNOWN_CONSERVATIVE_LIVED_TOGETHER') {
    warnings.push(UNKNOWN_MFS_IRMAA_WARNING);
  }
  const rows: HealthcareProjectionRow[] = [];
  for (let year = startYear; year <= endYear; year += 1) {
    const cost = healthcareCostAtYear(input, assumptions, year);
    warnings.push(...cost.warnings);
    rows.push({
      year,
      annual: cost.annual,
      presentValue: presentValue(cost.annual, year, assumptions),
      people: cost.people,
      warnings: cost.warnings,
    });
  }

  const summaries: HealthcarePersonSummary[] = input.persons.map((person) => {
    const personRows = rows.map((row) => ({ row, person: row.people.find((entry) => entry.role === person.role) })).filter(
      (entry): entry is { row: HealthcareProjectionRow; person: HealthcarePersonCost } => entry.person !== undefined,
    );
    const lifetimeFutureCost = roundMoney(personRows.reduce((sum, entry) => sum + entry.person.annual, 0));
    const lifetimePresentCost = roundMoney(personRows.reduce((sum, entry) => sum + presentValue(entry.person.annual, entry.row.year, assumptions), 0));
    const firstProjectionAge = ageAtYear(person.dob, startYear);
    return {
      role: person.role,
      name: person.name,
      medicareStartYear: birthYear(person.dob) + 65,
      preMedicareGapYears: Math.max(0, Math.min(person.planningAge, 65) - Math.max(0, firstProjectionAge)),
      lifetimeFutureCost,
      lifetimePresentCost,
    };
  });

  const hsaYears = hsaCoverageYears(input, assumptions, startYear, endYear, warnings);
  const lifetimeFutureCost = roundMoney(rows.reduce((sum, row) => sum + row.annual, 0));
  const lifetimePresentCost = roundMoney(rows.reduce((sum, row) => sum + row.presentValue, 0));
  const allWarnings = uniqueWarnings(warnings);

  return {
    status: allWarnings.length === 0 ? 'COMPLETE' : 'PARTIAL',
    warnings: allWarnings,
    sources: uniqueWarnings([
      ...assumptions.annual.sources.map((source) => source.url),
      ...assumptions.sources.map((source) => source.url),
      CMS_2026_PREMIUMS_URL,
      MEDICARE_ENROLLMENT_URL,
      IRS_HSA_URL,
    ]),
    people: summaries,
    rows,
    lifetimeFutureCost,
    lifetimePresentCost,
    hsaCoverageYears: hsaYears,
  };
}
