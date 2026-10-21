import { projectAnnualRules } from '@/lib/assumptions/defaults';
import { ageAtYear, ageMonthsOn, roundMoney, uniqueWarnings } from './math';
import type { AnnualRules, ModuleMeta, PersonRole, PlanningAccount, PlanningAssumptions, PlanningInput, PlanningPerson } from './types';

type AccountType = PlanningAccount['type'];
type TaxBucket = 'TAX_DEFERRED' | 'TAX_FREE' | 'TAXABLE' | 'UNCLASSIFIED' | 'NON_PORTFOLIO';

export interface AccumulationBuckets {
  /** Workplace pretax, traditional IRA, and qualified annuity balances. */
  taxDeferred: number;
  /** Roth and HSA balances combined; HSA qualified-use eligibility remains separately flagged. */
  taxFree: number;
  roth: number;
  hsa: number;
  /** Brokerage, cash, and nonqualified-annuity balances. */
  taxable: number;
  /** Annuities whose tax qualification is unknown. */
  unclassified: number;
  /** Cash-value life insurance, retained for visibility but excluded from portfolioAtRetirement. */
  nonPortfolio: number;
}

export interface AccumulationContributionDetail {
  /** Nominal salary used to calculate this working year's percentage contributions. */
  salary: number;
  employeeWorkplace: number;
  employerMatch: number;
  ira: number;
  total: number;
  workplaceEmployeeLimit: number;
  iraLimit: number;
  working: boolean;
}

export interface AccumulationRow {
  year: number;
  ages: Partial<Record<PersonRole, number>>;
  totalBalance: number;
  /** Total deposits in the year, after applicable employee/IRA caps. */
  contributions: number;
  contributionDetails: Partial<Record<PersonRole, AccumulationContributionDetail>>;
  buckets: AccumulationBuckets;
}

export interface AccumulationEndingAccount {
  owner: PersonRole;
  type: AccountType;
  balance: number;
  bucket: TaxBucket;
}

export interface AccumulationResult extends ModuleMeta {
  rows: AccumulationRow[];
  portfolioAtRetirement: number;
  retirementYear: number;
  endingAccounts: AccumulationEndingAccount[];
}

interface WorkingAccount {
  owner: PersonRole;
  type: AccountType;
  balance: number;
  annuityQualification: PlanningAccount['annuityQualification'];
  hsaQualified: PlanningAccount['hsaQualified'];
}

const ACCOUNT_TYPES: AccountType[] = [
  'K401_PRETAX',
  'ROTH_401K',
  'TRAD_IRA',
  'ROTH_IRA',
  'HSA',
  'BROKERAGE',
  'CASH',
  'ANNUITY',
  'CASH_VALUE_LIFE',
];

function accountKey(owner: PersonRole, type: AccountType): string {
  return `${owner}:${type}`;
}

function assertFiniteNonnegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite non-negative number.`);
}

function asDate(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be a YYYY-MM-DD date.`);
  const parsed = new Date(`${value}T00:00:00Z`);
  const [year, month, day] = value.split('-').map(Number);
  if (!Number.isFinite(parsed.getTime()) || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function retirementDate(person: PlanningPerson): Date {
  if (!Number.isInteger(person.retirementAgeMonths) || person.retirementAgeMonths < 0) {
    throw new Error(`${person.name}: retirement age must be a non-negative whole number of months.`);
  }
  return addMonths(asDate(person.dob, `${person.name} date of birth`), person.retirementAgeMonths);
}

/**
 * This is a calendar-year model. A person who reaches the selected retirement
 * date after January 1 is credited with that year's annual contributions; no
 * unsupported fractional-year contribution convention is invented.
 */
function isWorkingInYear(person: PlanningPerson, asOfDate: string, year: number): boolean {
  if (person.ageMonths >= person.retirementAgeMonths) return false;
  const firstDay = new Date(`${year}-01-01T00:00:00Z`);
  const targetRetirement = retirementDate(person);
  return targetRetirement.getTime() > firstDay.getTime() && ageMonthsOn(person.dob, asOfDate) < person.retirementAgeMonths;
}

function employeeWorkplaceLimit(rules: AnnualRules, age: number): number {
  const { workplace, workplaceCatchup50, workplaceCatchup60to63 } = rules.contributions;
  assertFiniteNonnegative(workplace, 'Annual workplace contribution limit');
  assertFiniteNonnegative(workplaceCatchup50, 'Annual age-50 workplace catch-up limit');
  assertFiniteNonnegative(workplaceCatchup60to63, 'Annual age-60-to-63 workplace catch-up limit');

  const catchup = age >= 60 && age <= 63
    ? workplaceCatchup60to63
    : age >= 50
      ? workplaceCatchup50
      : 0;
  return roundMoney(workplace + catchup);
}

function iraLimit(rules: AnnualRules, age: number): number {
  const { ira, iraCatchup50 } = rules.contributions;
  assertFiniteNonnegative(ira, 'Annual IRA contribution limit');
  assertFiniteNonnegative(iraCatchup50, 'Annual IRA age-50 catch-up limit');
  return roundMoney(ira + (age >= 50 ? iraCatchup50 : 0));
}

function bucketFor(account: WorkingAccount): TaxBucket {
  switch (account.type) {
    case 'K401_PRETAX':
    case 'TRAD_IRA':
      return 'TAX_DEFERRED';
    case 'ROTH_401K':
    case 'ROTH_IRA':
    case 'HSA':
      return 'TAX_FREE';
    case 'BROKERAGE':
    case 'CASH':
      return 'TAXABLE';
    case 'ANNUITY':
      if (account.annuityQualification === 'QUALIFIED') return 'TAX_DEFERRED';
      if (account.annuityQualification === 'NONQUALIFIED') return 'TAXABLE';
      return 'UNCLASSIFIED';
    case 'CASH_VALUE_LIFE':
      return 'NON_PORTFOLIO';
  }
}

function buildBuckets(accounts: Iterable<WorkingAccount>): AccumulationBuckets {
  const buckets: AccumulationBuckets = {
    taxDeferred: 0,
    taxFree: 0,
    roth: 0,
    hsa: 0,
    taxable: 0,
    unclassified: 0,
    nonPortfolio: 0,
  };

  for (const account of accounts) {
    const balance = roundMoney(account.balance);
    switch (bucketFor(account)) {
      case 'TAX_DEFERRED':
        buckets.taxDeferred = roundMoney(buckets.taxDeferred + balance);
        break;
      case 'TAX_FREE':
        buckets.taxFree = roundMoney(buckets.taxFree + balance);
        if (account.type === 'HSA') buckets.hsa = roundMoney(buckets.hsa + balance);
        else buckets.roth = roundMoney(buckets.roth + balance);
        break;
      case 'TAXABLE':
        buckets.taxable = roundMoney(buckets.taxable + balance);
        break;
      case 'UNCLASSIFIED':
        buckets.unclassified = roundMoney(buckets.unclassified + balance);
        break;
      case 'NON_PORTFOLIO':
        buckets.nonPortfolio = roundMoney(buckets.nonPortfolio + balance);
        break;
    }
  }
  return buckets;
}

function totalPortfolio(accounts: Iterable<WorkingAccount>): number {
  let total = 0;
  for (const account of accounts) {
    if (bucketFor(account) !== 'NON_PORTFOLIO') total = roundMoney(total + account.balance);
  }
  return total;
}

function rulesForYear(base: AnnualRules, year: number, inflation: number): AnnualRules {
  if (year < base.year) {
    throw new Error(`Accumulation begins in ${year}, but annual rules start in ${base.year}; supply annual rules for the earlier year.`);
  }
  const rules = year === base.year ? base : projectAnnualRules(base, year, inflation);
  if (rules.year !== year) throw new Error(`Projected annual rules for ${year} returned rule year ${rules.year}.`);
  return rules;
}

function createAccounts(input: PlanningInput, warnings: string[]): Map<string, WorkingAccount> {
  const accounts = new Map<string, WorkingAccount>();
  for (const inputAccount of input.accounts) {
    if (!ACCOUNT_TYPES.includes(inputAccount.type)) throw new Error(`Unsupported account type: ${inputAccount.type}.`);
    assertFiniteNonnegative(inputAccount.balance, `${inputAccount.owner} ${inputAccount.type} balance`);
    const key = accountKey(inputAccount.owner, inputAccount.type);
    const existing = accounts.get(key);
    if (existing) {
      existing.balance = roundMoney(existing.balance + inputAccount.balance);
      if (existing.annuityQualification !== inputAccount.annuityQualification) existing.annuityQualification = null;
      if (existing.hsaQualified !== inputAccount.hsaQualified) existing.hsaQualified = null;
    } else {
      accounts.set(key, {
        owner: inputAccount.owner,
        type: inputAccount.type,
        balance: roundMoney(inputAccount.balance),
        annuityQualification: inputAccount.annuityQualification,
        hsaQualified: inputAccount.hsaQualified,
      });
    }

    if (inputAccount.type === 'ANNUITY' && inputAccount.annuityQualification === null && inputAccount.balance > 0) {
      warnings.push(`${inputAccount.owner}: annuity tax qualification is unknown; its balance is shown as unclassified rather than assigned to a tax bucket.`);
    }
    if (inputAccount.type === 'HSA' && inputAccount.hsaQualified !== true && inputAccount.balance > 0) {
      warnings.push(`${inputAccount.owner}: HSA qualified-medical-use eligibility is not confirmed; the tax-free label is conditional on qualified use.`);
    }
    if (inputAccount.type === 'CASH_VALUE_LIFE' && inputAccount.balance > 0) {
      warnings.push(`${inputAccount.owner}: cash-value life insurance is retained unchanged for visibility but excluded from portfolio growth and portfolioAtRetirement.`);
    }
  }
  return accounts;
}

function addToAccount(accounts: Map<string, WorkingAccount>, owner: PersonRole, type: AccountType, amount: number): void {
  if (amount <= 0) return;
  const key = accountKey(owner, type);
  const existing = accounts.get(key);
  if (existing) {
    existing.balance = roundMoney(existing.balance + amount);
    return;
  }
  accounts.set(key, {
    owner,
    type,
    balance: roundMoney(amount),
    annuityQualification: null,
    hsaQualified: null,
  });
}

function growAccounts(accounts: Iterable<WorkingAccount>, returnRate: number): void {
  for (const account of accounts) {
    if (bucketFor(account) === 'NON_PORTFOLIO') continue;
    account.balance = roundMoney(account.balance * (1 + returnRate));
  }
}

function validatePerson(person: PlanningPerson): void {
  assertFiniteNonnegative(person.earnedIncomeAnnual, `${person.name} earned income`);
  assertFiniteNonnegative(person.combinedIraContributionAnnual, `${person.name} IRA/Roth contribution`);
  if (!Number.isFinite(person.employeeContributionRate) || person.employeeContributionRate < 0 || person.employeeContributionRate > 1) {
    throw new Error(`${person.name}: employee contribution rate must be between 0 and 1.`);
  }
  if (!Number.isFinite(person.employerMatchRate) || person.employerMatchRate < 0 || person.employerMatchRate > 1) {
    throw new Error(`${person.name}: employer match rate must be between 0 and 1.`);
  }
  asDate(person.dob, `${person.name} date of birth`);
}

/**
 * Projects account balances through the household's latest retirement year.
 * Values are nominal dollars and are rounded half-up to cents at each annual
 * account-growth and contribution boundary. It intentionally uses only the
 * annual contribution limits supplied in PlanningAssumptions.
 */
export function calculateAccumulation(input: PlanningInput, assumptions: PlanningAssumptions): AccumulationResult {
  asDate(input.asOfDate, 'As-of date');
  if (input.persons.length === 0) throw new Error('At least one planning person is required for accumulation.');
  if (!Number.isFinite(assumptions.inflation) || assumptions.inflation <= -1) throw new Error('Inflation must be greater than -100%.');

  const returnRate = assumptions.returnByRisk[input.riskProfile];
  if (!Number.isFinite(returnRate) || returnRate <= -1) throw new Error(`No valid return assumption exists for ${input.riskProfile}.`);

  const warnings: string[] = [];
  let incomplete = false;
  const accounts = createAccounts(input, warnings);
  const asOfYear = Number(input.asOfDate.slice(0, 4));
  const retirementYears = input.persons.map((person) => {
    validatePerson(person);
    return retirementDate(person).getUTCFullYear();
  });
  const householdAlreadyRetired = input.persons.every((person) => person.ageMonths >= person.retirementAgeMonths);
  const retirementYear = householdAlreadyRetired ? asOfYear : Math.max(asOfYear, ...retirementYears);

  const salaryByOwner = new Map<PersonRole, number>();
  for (const person of input.persons) salaryByOwner.set(person.role, roundMoney(person.earnedIncomeAnnual));

  const rows: AccumulationRow[] = [];
  const finalYear = householdAlreadyRetired ? asOfYear - 1 : retirementYear;
  for (let year = asOfYear; year <= finalYear; year += 1) {
    const rules = rulesForYear(assumptions.annual, year, assumptions.inflation);
    growAccounts(accounts.values(), returnRate);

    let contributionTotal = 0;
    const contributionDetails: Partial<Record<PersonRole, AccumulationContributionDetail>> = {};
    for (const person of input.persons) {
      const working = isWorkingInYear(person, input.asOfDate, year);
      const salary = salaryByOwner.get(person.role) ?? 0;
      const age = ageAtYear(person.dob, year);
      const workplaceLimit = employeeWorkplaceLimit(rules, age);
      const individualIraLimit = iraLimit(rules, age);

      let employeeWorkplace = 0;
      let employerMatch = 0;
      let ira = 0;
      if (working) {
        const requestedWorkplace = roundMoney(salary * person.employeeContributionRate);
        employeeWorkplace = roundMoney(Math.min(requestedWorkplace, workplaceLimit));
        if (requestedWorkplace > workplaceLimit) {
          warnings.push(`${person.name}: employee workplace contribution is capped at the ${year} annual limit of $${workplaceLimit.toFixed(2)}.`);
        }

        // The intake contains one employee rate but no Roth-elective allocation.
        // Its normalized plan-match field is attached to pretax 401(k), so both
        // workplace deposits stay in the distinct pretax bucket.
        if (employeeWorkplace > 0 || person.employerMatchRate > 0) {
          addToAccount(accounts, person.role, 'K401_PRETAX', employeeWorkplace);
        }
        if (employeeWorkplace > 0) {
          employerMatch = roundMoney(salary * person.employerMatchRate);
          addToAccount(accounts, person.role, 'K401_PRETAX', employerMatch);
        }
        if (person.employeeContributionRate > 0 && accounts.has(accountKey(person.role, 'ROTH_401K'))) {
          warnings.push(`${person.name}: ongoing employee workplace deposits are modeled as pretax because the intake does not capture a Roth-elective allocation; the existing Roth 401(k) balance remains separate.`);
        }

        if (person.combinedIraContributionAnnual > 0) {
          if (person.iraContributionDestination === null) {
            incomplete = true;
            warnings.push(`${person.name}: combined IRA/Roth contribution is not modeled because its destination is unknown.`);
          } else {
            ira = roundMoney(Math.min(person.combinedIraContributionAnnual, individualIraLimit));
            if (person.combinedIraContributionAnnual > individualIraLimit) {
              warnings.push(`${person.name}: IRA/Roth contribution is capped at the ${year} annual limit of $${individualIraLimit.toFixed(2)}.`);
            }
            addToAccount(accounts, person.role, person.iraContributionDestination, ira);
          }
        }
      } else if (person.earnedIncomeAnnual > 0 || person.employeeContributionRate > 0 || person.combinedIraContributionAnnual > 0) {
        warnings.push(`${person.name}: no employee, employer-match, or IRA contribution is projected after the selected retirement date despite provided earned-income or contribution fields.`);
      }

      const total = roundMoney(employeeWorkplace + employerMatch + ira);
      contributionTotal = roundMoney(contributionTotal + total);
      contributionDetails[person.role] = {
        salary: working ? salary : 0,
        employeeWorkplace,
        employerMatch,
        ira,
        total,
        workplaceEmployeeLimit: workplaceLimit,
        iraLimit: individualIraLimit,
        working,
      };
      salaryByOwner.set(person.role, roundMoney(salary * (1 + assumptions.inflation)));
    }

    const buckets = buildBuckets(accounts.values());
    rows.push({
      year,
      ages: Object.fromEntries(input.persons.map((person) => [person.role, ageAtYear(person.dob, year)])) as Partial<Record<PersonRole, number>>,
      totalBalance: totalPortfolio(accounts.values()),
      contributions: contributionTotal,
      contributionDetails,
      buckets,
    });
  }

  // A household already retired at the as-of date needs a retirement balance
  // snapshot, not an invented extra year of market growth.
  if (householdAlreadyRetired) {
    const buckets = buildBuckets(accounts.values());
    rows.push({
      year: asOfYear,
      ages: Object.fromEntries(input.persons.map((person) => [person.role, ageAtYear(person.dob, asOfYear)])) as Partial<Record<PersonRole, number>>,
      totalBalance: totalPortfolio(accounts.values()),
      contributions: 0,
      contributionDetails: Object.fromEntries(input.persons.map((person) => [person.role, {
        salary: 0,
        employeeWorkplace: 0,
        employerMatch: 0,
        ira: 0,
        total: 0,
        workplaceEmployeeLimit: 0,
        iraLimit: 0,
        working: false,
      }])) as Partial<Record<PersonRole, AccumulationContributionDetail>>,
      buckets,
    });
  }

  const endingAccounts = [...accounts.values()]
    .map((account) => ({ owner: account.owner, type: account.type, balance: roundMoney(account.balance), bucket: bucketFor(account) }))
    .sort((left, right) => left.owner.localeCompare(right.owner) || ACCOUNT_TYPES.indexOf(left.type) - ACCOUNT_TYPES.indexOf(right.type));

  return {
    status: incomplete ? 'PARTIAL' : 'COMPLETE',
    warnings: uniqueWarnings(warnings),
    sources: [...new Set(assumptions.annual.sources.map((source) => source.url).filter(Boolean))],
    rows,
    portfolioAtRetirement: totalPortfolio(accounts.values()),
    retirementYear,
    endingAccounts,
  };
}
