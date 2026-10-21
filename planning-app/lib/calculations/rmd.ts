import { roundMoney, uniqueWarnings } from './math';
import type { AnnualRules, ModuleMeta, PersonRole, PlanningAccount, PlanningAssumptions, PlanningInput, PlanningPerson } from './types';
import { RMD_TABLES_2026 } from '../assumptions/rmd-tables-2026';

const MAX_TABLE_AGE = 120;
const ILLUSTRATIVE_BALANCE_LABEL = 'Illustrative only: current balance is not the actual prior December 31 balance.';

export type RmdTable = 'UNIFORM' | 'JOINT_AND_LAST_SURVIVOR';

export interface RmdExcludedBalance {
  accountType: PlanningAccount['type'];
  balance: number;
  reason: string;
}

export interface RmdPerson {
  owner: PersonRole;
  name: string;
  birthYear: number;
  startAge: number;
  eligibleBalance: number;
  excludedBalances: RmdExcludedBalance[];
}

export interface RmdScheduleRow {
  year: number;
  owner: PersonRole;
  age: number;
  startAge: number;
  balanceBasis: number;
  balanceBasisLabel: string;
  illustrative: true;
  table: RmdTable;
  distributionPeriod: number;
  rmd: number;
}

export interface RmdResult {
  meta: ModuleMeta;
  people: RmdPerson[];
  schedule: RmdScheduleRow[];
}

/**
 * SECURE 2.0 RMD ages for the birth-year interface in the shared contract.
 * A person born in 1959 starts at 73 under the proposed IRS clarification.
 */
export function rmdStartAge(birthYear: number): number {
  if (!Number.isInteger(birthYear) || birthYear < 1800 || birthYear > 3000) {
    throw new Error('Birth year must be a plausible whole calendar year.');
  }
  if (birthYear >= 1960) return 75;
  if (birthYear >= 1951) return 73;
  return 72;
}

/**
 * Computes an original owner's annual RMD from a supplied prior-December-31 balance.
 * RMD factors always come from `rules`, never from a calculation formula constant.
 */
export function calculateRmd(
  priorBalance: number,
  age: number,
  birthYear: number,
  rules: AnnualRules,
  options?: { soleSpouseBeneficiary?: boolean; spouseAge?: number },
): number {
  assertNonnegativeMoney(priorBalance, 'Prior-year account balance');
  assertWholeAge(age, 'Owner age');

  if (age < rmdStartAge(birthYear) || priorBalance === 0) return 0;

  const distributionPeriod = rmdDistributionPeriod(age, rules, options);
  return roundMoney(priorBalance / distributionPeriod.factor);
}

/**
 * Uses present account balances only as an explicitly labeled illustration. The
 * intake contract has no prior-December-31 balance, beneficiary designation,
 * inherited-account status, working-status, or 5%-owner field.
 */
export function calculateRmds(input: PlanningInput, assumptions: PlanningAssumptions): RmdResult {
  const asOfYear = yearFromIsoDate(input.asOfDate, 'As-of date');
  const people: RmdPerson[] = [];
  const schedule: RmdScheduleRow[] = [];
  const warnings = [
    ILLUSTRATIVE_BALANCE_LABEL,
    'RMDs are modeled only for original account owners. Inherited-account rules, including beneficiary status, the 10-year rule, and the Single Life table, are unsupported by the current account input.',
    'The intake does not contain a sole-spouse beneficiary designation or spouse beneficiary age for each account, so this schedule uses the Uniform Lifetime table.',
    'Workplace-plan delayed-RMD eligibility, 5% owner status, and pre-1987 403(b) balances are not represented; verify plan-specific treatment before relying on the schedule.',
  ];

  for (const person of input.persons) {
    const birthYear = yearFromIsoDate(person.dob, `${person.role} date of birth`);
    const accountSummary = summarizeEligibleAccounts(input.accounts, person.role, warnings);
    const startAge = rmdStartAge(birthYear);
    const eligibleBalance = roundMoney(accountSummary.eligibleBalance);

    people.push({
      owner: person.role,
      name: person.name,
      birthYear,
      startAge,
      eligibleBalance,
      excludedBalances: accountSummary.excludedBalances,
    });

    if (eligibleBalance === 0) continue;

    const finalAge = planningHorizon(person);
    const firstScheduleAge = Math.max(startAge, asOfYear - birthYear);
    for (let scheduleAge = firstScheduleAge; scheduleAge <= finalAge; scheduleAge += 1) {
      const year = birthYear + scheduleAge;
      const period = rmdDistributionPeriod(scheduleAge, assumptions.annual);
      schedule.push({
        year,
        owner: person.role,
        age: scheduleAge,
        startAge,
        balanceBasis: eligibleBalance,
        balanceBasisLabel: ILLUSTRATIVE_BALANCE_LABEL,
        illustrative: true,
        table: period.table,
        distributionPeriod: period.factor,
        rmd: roundMoney(eligibleBalance / period.factor),
      });
    }
  }

  return {
    meta: {
      status: 'PARTIAL',
      warnings: uniqueWarnings(warnings),
      sources: RMD_TABLES_2026.sources.map((source) => source.url),
    },
    people,
    schedule,
  };
}

function rmdDistributionPeriod(
  age: number,
  rules: AnnualRules,
  options?: { soleSpouseBeneficiary?: boolean; spouseAge?: number },
): { factor: number; table: RmdTable } {
  assertWholeAge(age, 'Owner age');
  if (options?.soleSpouseBeneficiary === true && options.spouseAge === undefined) {
    throw new Error('Spouse age is required when the sole-spouse-beneficiary option is selected.');
  }
  if (options?.spouseAge !== undefined) assertWholeAge(options.spouseAge, 'Spouse age');
  const ownerTableAge = Math.min(age, MAX_TABLE_AGE);
  const useJointTable = options?.soleSpouseBeneficiary === true
    && options.spouseAge !== undefined
    && age - options.spouseAge > 10;

  if (useJointTable) {
    const key = `${ownerTableAge}:${options.spouseAge}`;
    const factor = rules.rmdJoint?.[key];
    assertDistributionPeriod(factor, `Joint Life factor for owner age ${ownerTableAge} and spouse age ${options.spouseAge}`);
    return { factor, table: 'JOINT_AND_LAST_SURVIVOR' };
  }

  const factor = rules.rmdUniform[String(ownerTableAge)];
  assertDistributionPeriod(factor, `Uniform Lifetime factor for owner age ${ownerTableAge}`);
  return { factor, table: 'UNIFORM' };
}

function summarizeEligibleAccounts(
  accounts: readonly PlanningAccount[],
  owner: PersonRole,
  warnings: string[],
): { eligibleBalance: number; excludedBalances: RmdExcludedBalance[] } {
  let eligibleBalance = 0;
  const excludedBalances: RmdExcludedBalance[] = [];

  for (const account of accounts) {
    if (account.owner !== owner) continue;
    assertNonnegativeMoney(account.balance, `${account.type} balance`);

    if (account.type === 'K401_PRETAX' || account.type === 'TRAD_IRA') {
      eligibleBalance += account.balance;
      continue;
    }

    if (account.type === 'ANNUITY' && account.annuityQualification === 'QUALIFIED') {
      eligibleBalance += account.balance;
      continue;
    }

    const reason = exclusionReason(account);
    if (reason) {
      excludedBalances.push({ accountType: account.type, balance: roundMoney(account.balance), reason });
      if (account.balance > 0 && account.type === 'ANNUITY' && account.annuityQualification === null) {
        warnings.push('An annuity has unknown tax qualification and is excluded from the RMD illustration until it is classified as qualified or nonqualified.');
      }
    }
  }

  return { eligibleBalance, excludedBalances };
}

function exclusionReason(account: PlanningAccount): string | null {
  if (account.type === 'ANNUITY') {
    if (account.annuityQualification === 'NONQUALIFIED') return 'Nonqualified annuities are excluded from this original-owner RMD calculation.';
    if (account.annuityQualification === null) return 'Annuity qualification is unknown; excluded pending classification.';
  }
  if (account.type === 'HSA') return 'HSAs are not included in the retirement-account RMD base.';
  if (account.type === 'ROTH_IRA' || account.type === 'ROTH_401K') return 'Original-owner Roth and designated Roth balances are excluded from lifetime RMDs.';
  if (account.type === 'BROKERAGE' || account.type === 'CASH' || account.type === 'CASH_VALUE_LIFE') return 'Not a tax-deferred retirement account subject to this RMD calculation.';
  return null;
}

function planningHorizon(person: PlanningPerson): number {
  if (!Number.isInteger(person.planningAge) || person.planningAge < 0) {
    throw new Error(`${person.role} planning age must be a nonnegative whole number.`);
  }
  return Math.min(person.planningAge, MAX_TABLE_AGE);
}

function yearFromIsoDate(value: string, label: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must use YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed.getUTCFullYear();
}

function assertWholeAge(age: number, label: string): void {
  if (!Number.isInteger(age) || age < 0 || age > 200) throw new Error(`${label} must be a nonnegative whole number.`);
}

function assertNonnegativeMoney(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1e13) throw new Error(`${label} is outside the supported range.`);
}

function assertDistributionPeriod(value: number | undefined, label: string): asserts value is number {
  if (!Number.isFinite(value) || (value as number) <= 0) throw new Error(`${label} is unavailable in annual RMD rules.`);
}
