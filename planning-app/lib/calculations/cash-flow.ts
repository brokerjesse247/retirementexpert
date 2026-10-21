import { projectAnnualRules } from '../assumptions/defaults';
import { healthcareCostAtYear } from './healthcare';
import { ageAtYear, ageMonthsOn, roundMoney, uniqueWarnings } from './math';
import { calculateRmd, rmdStartAge } from './rmd';
import { householdBenefitsAtYear } from './social-security';
import { calculateTax } from './tax';
import type {
  AnnualRules,
  CashFlowOptions,
  ModuleMeta,
  PersonRole,
  PlanningAccount,
  PlanningAssumptions,
  PlanningInput,
  PlanningPerson,
} from './types';

/** A single annual row. `portfolioNeed` is intentionally retained even after a portfolio is depleted. */
export interface CashFlowRow {
  year: number;
  age: number;
  spouseAge: number | null;
  spending: number;
  healthcare: number;
  goals: number;
  socialSecurity: number;
  pension: number;
  annuity: number;
  otherIncome: number;
  wages: number;
  portfolioWithdrawal: number;
  /** Required net portfolio funding, including actual federal/state tax, before considering available assets. */
  portfolioNeed: number;
  /** Actual portfolio consumption. Retained RMD cash is deliberately excluded. */
  netPortfolioDraw: number;
  federalTax: number;
  stateTax: number;
  rmd: number;
  rothConversion: number;
  endingBalance: number;
  taxableBalance: number;
  taxDeferredBalance: number;
  rothBalance: number;
  hsaBalance: number;
  magi: number;
  /** Amount of the year's cash obligation that available portfolio sources could not fund. */
  unmetNeed: number;
  /** True when unmetNeed is positive or bounded tax convergence did not complete. */
  failed: boolean;
  taxConverged: boolean;
}

export interface CashFlowResult extends ModuleMeta {
  rows: CashFlowRow[];
  retirementYear: number;
  /** Beginning-of-year modeled portfolio total in the selected retirement year. */
  portfolioAtRetirement: number;
  depletionAge: number | null;
  endingLegacy: number;
  lifetimeFederalTax: number;
  incomeCoverageRatio: number | null;
  /** Monthly Social Security income loss at the modeled first-death transition, if any. */
  survivorIncomeDropMonthly: number;
}

type InternalAccount = Omit<PlanningAccount, 'balance' | 'costBasis'> & {
  balance: number;
  costBasis: number | null;
};

type AccountState = InternalAccount[];

type CashDistribution = {
  amount: number;
  capitalGains: number;
};

type TaxIteration = {
  accounts: AccountState;
  hsaWithdrawal: number;
  taxableWithdrawal: CashDistribution;
  pretaxWithdrawal: number;
  rothWithdrawal: number;
  federalTax: number;
  stateTax: number;
  magi: number;
  taxConverged: boolean;
  portfolioNeed: number;
  actualPortfolioFunding: number;
  cashSurplus: number;
  unmetNeed: number;
};

const MAX_TAX_ITERATIONS = 12;
const CENT = 0.01;

function requireFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1e12) {
    throw new Error(`${name} must be a finite non-negative amount.`);
  }
}

function requireRate(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a finite rate from 0 through 1.`);
  }
}

function copyAccounts(accounts: AccountState): AccountState {
  return accounts.map((account) => ({ ...account }));
}

function birthYear(person: PlanningPerson): number {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(person.dob);
  if (!match) throw new Error(`${person.name}: date of birth must be YYYY-MM-DD.`);
  return Number(match[1]);
}

function startYear(input: PlanningInput): number {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(input.asOfDate);
  if (!match) throw new Error('asOfDate must be a YYYY-MM-DD date.');
  return Number(match[1]);
}

function yearAtAgeMonths(person: PlanningPerson, ageMonths: number): number {
  if (!Number.isInteger(ageMonths) || ageMonths < 0) throw new Error(`${person.name}: age milestone is invalid.`);
  const birth = new Date(`${person.dob}T00:00:00Z`);
  if (!Number.isFinite(birth.getTime())) throw new Error(`${person.name}: date of birth is invalid.`);
  return birth.getUTCFullYear() + Math.floor((birth.getUTCMonth() + ageMonths) / 12);
}

function lastDayOfMonth(year: number, monthZeroBased: number): string {
  const day = new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate();
  return `${year}-${String(monthZeroBased + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthsInYear(person: PlanningPerson, year: number, condition: (ageMonths: number) => boolean): number {
  let count = 0;
  for (let month = 0; month < 12; month += 1) {
    const ageMonths = ageMonthsOn(person.dob, lastDayOfMonth(year, month));
    if (ageMonths <= person.planningAge * 12 && condition(ageMonths)) count += 1;
  }
  return count;
}

function isAliveInYear(person: PlanningPerson, year: number): boolean {
  return ageAtYear(person.dob, year) <= person.planningAge;
}

function annualFactor(rate: number, year: number, baseYear: number, name: string): number {
  requireRate(rate, name);
  const elapsed = year - baseYear;
  const factor = Math.pow(1 + rate, elapsed);
  if (!Number.isFinite(factor) || factor <= 0) throw new Error(`${name} projection is outside supported range.`);
  return factor;
}

function accountIsRmdEligible(account: InternalAccount): boolean {
  return account.type === 'K401_PRETAX'
    || account.type === 'TRAD_IRA'
    || (account.type === 'ANNUITY' && account.annuityQualification === 'QUALIFIED');
}

function accountIsVoluntaryPretax(account: InternalAccount): boolean {
  return accountIsRmdEligible(account);
}

function accountIsRoth(account: InternalAccount): boolean {
  return account.type === 'ROTH_401K' || account.type === 'ROTH_IRA';
}

function accountIsQualifiedHsa(account: InternalAccount): boolean {
  return account.type === 'HSA' && account.hsaQualified === true;
}

function accountIsTaxableCash(account: InternalAccount): boolean {
  return account.type === 'CASH' || account.type === 'BROKERAGE';
}

function orderAccounts(accounts: AccountState, predicate: (account: InternalAccount) => boolean, order: (account: InternalAccount) => number): InternalAccount[] {
  return accounts
    .filter((account) => predicate(account) && account.balance > 0)
    .sort((left, right) => order(left) - order(right));
}

function takeFromAccounts(
  accounts: AccountState,
  amount: number,
  predicate: (account: InternalAccount) => boolean,
  order: (account: InternalAccount) => number = () => 0,
): number {
  let remaining = roundMoney(Math.max(0, amount));
  let withdrawn = 0;
  for (const account of orderAccounts(accounts, predicate, order)) {
    if (remaining <= 0) break;
    const taken = roundMoney(Math.min(account.balance, remaining));
    account.balance = roundMoney(Math.max(0, account.balance - taken));
    withdrawn = roundMoney(withdrawn + taken);
    remaining = roundMoney(Math.max(0, remaining - taken));
  }
  return withdrawn;
}

function takeTaxableCash(accounts: AccountState, amount: number, warnings: string[]): CashDistribution {
  let remaining = roundMoney(Math.max(0, amount));
  let withdrawn = 0;
  let capitalGains = 0;
  const ordered = orderAccounts(
    accounts,
    accountIsTaxableCash,
    (account) => account.type === 'CASH' ? 0 : 1,
  );

  for (const account of ordered) {
    if (remaining <= 0) break;
    const before = account.balance;
    const taken = roundMoney(Math.min(before, remaining));
    let gain = 0;
    if (account.type === 'BROKERAGE') {
      if (account.costBasis === null) {
        warnings.push('Brokerage cost basis is unknown; realized capital gains from withdrawals are omitted rather than invented. Federal tax is therefore partial.');
      } else {
        const basisTaken = roundMoney(Math.min(account.costBasis, account.costBasis * (taken / before)));
        gain = roundMoney(Math.max(0, taken - basisTaken));
        account.costBasis = roundMoney(Math.max(0, account.costBasis - basisTaken));
      }
    }
    account.balance = roundMoney(Math.max(0, before - taken));
    withdrawn = roundMoney(withdrawn + taken);
    capitalGains = roundMoney(capitalGains + gain);
    remaining = roundMoney(Math.max(0, remaining - taken));
  }
  return { amount: withdrawn, capitalGains };
}

function addCash(accounts: AccountState, owner: PersonRole, amount: number): void {
  const rounded = roundMoney(amount);
  if (rounded <= 0) return;
  const target = accounts.find((account) => account.owner === owner && account.type === 'CASH');
  if (target) {
    target.balance = roundMoney(target.balance + rounded);
    return;
  }
  accounts.push({
    owner,
    type: 'CASH',
    balance: rounded,
    costBasis: rounded,
    annuityQualification: null,
    hsaQualified: null,
  });
}

function addRoth(accounts: AccountState, owner: PersonRole, amount: number): void {
  const rounded = roundMoney(amount);
  if (rounded <= 0) return;
  const target = accounts.find((account) => account.owner === owner && account.type === 'ROTH_IRA');
  if (target) {
    target.balance = roundMoney(target.balance + rounded);
    return;
  }
  accounts.push({
    owner,
    type: 'ROTH_IRA',
    balance: rounded,
    costBasis: null,
    annuityQualification: null,
    hsaQualified: null,
  });
}

function totalBalance(accounts: AccountState): number {
  return roundMoney(accounts.reduce((sum, account) => sum + account.balance, 0));
}

function bucketBalances(accounts: AccountState): Pick<CashFlowRow, 'taxableBalance' | 'taxDeferredBalance' | 'rothBalance' | 'hsaBalance'> {
  let taxableBalance = 0;
  let taxDeferredBalance = 0;
  let rothBalance = 0;
  let hsaBalance = 0;
  for (const account of accounts) {
    if (account.type === 'HSA') hsaBalance += account.balance;
    else if (accountIsRmdEligible(account)) taxDeferredBalance += account.balance;
    else if (accountIsRoth(account)) rothBalance += account.balance;
    // A nonqualified annuity remains in taxable assets but is not a liquid funding source.
    else if (account.type === 'CASH' || account.type === 'BROKERAGE' || (account.type === 'ANNUITY' && account.annuityQualification === 'NONQUALIFIED')) taxableBalance += account.balance;
  }
  return {
    taxableBalance: roundMoney(taxableBalance),
    taxDeferredBalance: roundMoney(taxDeferredBalance),
    rothBalance: roundMoney(rothBalance),
    hsaBalance: roundMoney(hsaBalance),
  };
}

function modeledPortfolioTotal(accounts: AccountState): number {
  return roundMoney(accounts
    .filter((account) => account.type !== 'CASH_VALUE_LIFE')
    .reduce((sum, account) => sum + account.balance, 0));
}

function applyReturn(accounts: AccountState, returnRate: number): void {
  if (!Number.isFinite(returnRate) || returnRate < -1 || returnRate > 10) {
    throw new Error('Annual return must be a finite rate from -100% through 1000%.');
  }
  for (const account of accounts) {
    if (account.type === 'CASH_VALUE_LIFE') continue;
    account.balance = roundMoney(Math.max(0, account.balance * (1 + returnRate)));
  }
}

function eligiblePretaxBalance(accounts: AccountState, owner: PersonRole): number {
  return roundMoney(accounts
    .filter((account) => account.owner === owner && accountIsRmdEligible(account))
    .reduce((sum, account) => sum + account.balance, 0));
}

function withdrawRmds(
  accounts: AccountState,
  input: PlanningInput,
  rules: AnnualRules,
  year: number,
  warnings: string[],
): number {
  let totalRmd = 0;
  for (const person of input.persons) {
    if (!isAliveInYear(person, year)) continue;
    const age = ageAtYear(person.dob, year);
    const requiredAge = rmdStartAge(birthYear(person));
    if (age < requiredAge) continue;
    const priorBalance = eligiblePretaxBalance(accounts, person.role);
    if (priorBalance <= 0) continue;
    const requested = calculateRmd(priorBalance, age, birthYear(person), rules);
    const taken = takeFromAccounts(
      accounts,
      Math.min(priorBalance, requested),
      (account) => account.owner === person.role && accountIsRmdEligible(account),
      (account) => account.type === 'TRAD_IRA' ? 0 : account.type === 'K401_PRETAX' ? 1 : 2,
    );
    if (taken < requested) warnings.push(`${year}: ${person.name}'s calculated RMD exceeded the modeled eligible balance and was capped at available assets.`);
    totalRmd = roundMoney(totalRmd + taken);
  }
  if (totalRmd > 0 && year === startYear(input)) {
    warnings.push('First-year RMDs use the supplied current eligible balances as a planning proxy; actual RMDs require prior December 31 balances.');
  }
  return totalRmd;
}

function scheduledConversion(
  accounts: AccountState,
  requested: number,
  warnings: string[],
): number {
  let remaining = roundMoney(Math.max(0, requested));
  let converted = 0;
  for (const role of ['PRIMARY', 'SPOUSE'] as const) {
    if (remaining <= 0) break;
    const taken = takeFromAccounts(
      accounts,
      remaining,
      (account) => account.owner === role && accountIsVoluntaryPretax(account),
      (account) => account.type === 'TRAD_IRA' ? 0 : account.type === 'K401_PRETAX' ? 1 : 2,
    );
    if (taken > 0) addRoth(accounts, role, taken);
    converted = roundMoney(converted + taken);
    remaining = roundMoney(Math.max(0, remaining - taken));
  }
  if (requested > converted) warnings.push('Scheduled Roth conversion was capped at remaining modeled pre-tax assets after mandatory RMDs.');
  return converted;
}

function targetBracketTop(rules: AnnualRules, filingStatus: PlanningInput['filingStatus'], targetRate: number): number | null {
  const brackets = rules.taxBrackets[filingStatus];
  if (!brackets) throw new Error(`Tax brackets missing for ${filingStatus}.`);
  const target = brackets.find((bracket) => Math.abs(bracket.rate - targetRate) < 1e-12);
  if (!target) return null;
  return target.upTo;
}

function incomeForYear(
  input: PlanningInput,
  assumptions: PlanningAssumptions,
  year: number,
  warnings: string[],
): Pick<CashFlowRow, 'wages' | 'pension' | 'annuity' | 'otherIncome'> {
  let wages = 0;
  let pension = 0;
  let annuity = 0;
  let otherIncome = 0;
  const baseYear = assumptions.annual.year;
  const cola = annualFactor(assumptions.inflation, year, baseYear, 'General inflation');

  for (const person of input.persons) {
    if (!isAliveInYear(person, year)) continue;
    const employmentMonths = monthsInYear(person, year, (ageMonths) => ageMonths < person.retirementAgeMonths);
    wages += person.earnedIncomeAnnual * (employmentMonths / 12);
    const partTimeMonths = monthsInYear(person, year, (ageMonths) => ageMonths >= person.retirementAgeMonths
      && (person.partTimeEndAgeMonths === null || ageMonths < person.partTimeEndAgeMonths));
    wages += person.partTimeAnnual * (partTimeMonths / 12);

    if (person.pensionMonthly > 0) {
      if (person.pensionStartAgeMonths === null) {
        warnings.push(`${person.name}: pension start age is unknown, so pension cash flow is excluded.`);
      } else {
        const paymentMonths = monthsInYear(person, year, (ageMonths) => ageMonths >= person.pensionStartAgeMonths!);
        const indexedMonthly = person.pensionMonthly * (person.pensionCola === true ? cola : 1);
        pension += indexedMonthly * paymentMonths;
      }
    }

    if (person.annuityMonthly > 0) {
      if (person.annuityStartAgeMonths === null) {
        warnings.push(`${person.name}: annuity start age is unknown, so annuity cash flow is excluded.`);
      } else {
        const paymentMonths = monthsInYear(person, year, (ageMonths) => ageMonths >= person.annuityStartAgeMonths!);
        annuity += person.annuityMonthly * paymentMonths;
        if (person.annuityQualification === 'NONQUALIFIED') {
          warnings.push(`${person.name}: nonqualified annuity exclusion ratio/basis is unavailable. The full payment is conservatively included as ordinary taxable income; verify Form 1099-R treatment.`);
        } else if (person.annuityQualification === null) {
          warnings.push(`${person.name}: annuity tax qualification is unknown. The full payment is conservatively included as ordinary taxable income; verify Form 1099-R treatment.`);
        }
      }
    }

    const otherMonths = monthsInYear(person, year, (ageMonths) => person.rentalEndAgeMonths === null || ageMonths < person.rentalEndAgeMonths);
    otherIncome += person.rentalOtherMonthly * otherMonths;
  }

  for (const purchase of input.hypotheticalAnnuities ?? []) {
    const owner = input.persons.find((person) => person.role === purchase.owner);
    if (!owner || !isAliveInYear(owner, year)) continue;
    const paymentMonths = monthsInYear(owner, year, (ageMonths) => ageMonths >= purchase.startAgeMonths);
    annuity += purchase.monthlyIncome * paymentMonths;
    if (purchase.taxQualification === 'NONQUALIFIED') {
      warnings.push(`Scenario hypothetical annuity for ${owner.name}: nonqualified exclusion ratio/basis is unavailable. The advisor-supplied payment is conservatively included as ordinary taxable income.`);
    } else if (purchase.taxQualification === null) {
      warnings.push(`Scenario hypothetical annuity for ${owner.name}: tax qualification is unknown. The advisor-supplied payment is conservatively included as ordinary taxable income.`);
    } else {
      warnings.push(`Scenario hypothetical annuity for ${owner.name}: qualified payment is included as ordinary taxable income; distribution eligibility and contract treatment require confirmation.`);
    }
  }

  // A deceased owner’s pension is reduced to the supplied survivor percentage for the living spouse.
  if (input.persons.length === 2) {
    const [first, second] = input.persons;
    for (const [decedent, survivor] of [[first, second], [second, first]] as const) {
      if (isAliveInYear(decedent, year) || !isAliveInYear(survivor, year) || decedent.pensionMonthly <= 0) continue;
      if (decedent.pensionSurvivorRate === null || decedent.pensionStartAgeMonths === null) {
        warnings.push(`${decedent.name}: survivor pension percentage is unknown; no survivor pension was assumed.`);
        continue;
      }
      const age = ageAtYear(decedent.dob, year);
      if (age * 12 < decedent.pensionStartAgeMonths) continue;
      const indexedMonthly = decedent.pensionMonthly * (decedent.pensionCola === true ? cola : 1);
      pension += indexedMonthly * 12 * decedent.pensionSurvivorRate;
    }
  }

  return {
    wages: roundMoney(wages),
    pension: roundMoney(pension),
    annuity: roundMoney(annuity),
    otherIncome: roundMoney(otherIncome),
  };
}

function annualSpending(
  input: PlanningInput,
  assumptions: PlanningAssumptions,
  year: number,
): number {
  const primary = input.persons.find((person) => person.role === 'PRIMARY') ?? input.persons[0];
  const alivePeople = input.persons.filter((person) => isAliveInYear(person, year));
  const inflation = annualFactor(assumptions.inflation, year, assumptions.annual.year, 'General inflation');
  const currentMonths = isAliveInYear(primary, year)
    ? monthsInYear(primary, year, (ageMonths) => ageMonths < primary.retirementAgeMonths)
    : 0;
  const retirementMonths = 12 - currentMonths;
  let annual = (input.currentMonthlySpending * currentMonths + input.retirementMonthlySpending * retirementMonths) * inflation;
  annual += input.annualCharity * inflation;
  if (input.persons.length === 2 && alivePeople.length === 1) annual *= assumptions.survivorSpendingPercent;
  return roundMoney(annual);
}

function annualGoals(input: PlanningInput, options: CashFlowOptions | undefined, year: number): number {
  const entered = input.goals.filter((goal) => goal.year === year).reduce((sum, goal) => sum + goal.amount, 0);
  const extra = options?.extraExpenses?.[String(year)] ?? 0;
  requireFiniteNonNegative(extra, `Extra expenses for ${year}`);
  return roundMoney(entered + extra);
}

function annualReturn(input: PlanningInput, assumptions: PlanningAssumptions, options: CashFlowOptions | undefined, year: number): number {
  const override = options?.returnByYear?.[String(year)];
  const value = override ?? assumptions.returnByRisk[input.riskProfile];
  if (!Number.isFinite(value) || value < -1 || value > 10) throw new Error(`Annual return for ${year} is invalid.`);
  return value;
}

function hsaEligibleLimit(accounts: AccountState, healthcareAnnual: number): number {
  const eligible = accounts.filter(accountIsQualifiedHsa).reduce((sum, account) => sum + account.balance, 0);
  return roundMoney(Math.min(Math.max(0, healthcareAnnual), eligible));
}

function taxAges(input: PlanningInput, year: number): number[] {
  return input.persons.filter((person) => isAliveInYear(person, year)).map((person) => ageAtYear(person.dob, year));
}

function stateTaxEstimate(
  stateRate: number | null,
  ordinaryIncome: number,
  taxableSocialSecurity: number,
  capitalGains: number,
): number {
  if (stateRate === null) return 0;
  requireRate(stateRate, 'State tax rate');
  return roundMoney(stateRate * Math.max(0, ordinaryIncome + taxableSocialSecurity + capitalGains));
}

function ensureInputIsSupported(input: PlanningInput, assumptions: PlanningAssumptions): void {
  if (!input.persons.length || input.persons.length > 2) throw new Error('Cash flow supports one or two planning persons.');
  requireFiniteNonNegative(input.currentMonthlySpending, 'Current monthly spending');
  requireFiniteNonNegative(input.retirementMonthlySpending, 'Retirement monthly spending');
  requireFiniteNonNegative(input.annualCharity, 'Annual charity');
  requireRate(assumptions.inflation, 'General inflation');
  requireRate(assumptions.survivorSpendingPercent, 'Survivor spending percent');
  for (const account of input.accounts) {
    requireFiniteNonNegative(account.balance, `${account.owner} ${account.type} balance`);
    if (account.costBasis !== null) requireFiniteNonNegative(account.costBasis, `${account.owner} ${account.type} cost basis`);
  }
  for (const purchase of input.hypotheticalAnnuities ?? []) {
    requireFiniteNonNegative(purchase.monthlyIncome, 'Hypothetical annuity monthly income');
    requireFiniteNonNegative(purchase.premium, 'Hypothetical annuity premium');
    if (!Number.isInteger(purchase.startAgeMonths) || purchase.startAgeMonths < 0) throw new Error('Hypothetical annuity start age must be a non-negative whole number of months.');
  }
}

/**
 * Produces a deterministic cash-basis projection. Annual annual-rule values are supplied
 * by the assumptions module; later years use its declared projection policy rather than
 * making a claim about future tax law.
 */
export function calculateCashFlow(
  input: PlanningInput,
  assumptions: PlanningAssumptions,
  options: CashFlowOptions = {},
): CashFlowResult {
  ensureInputIsSupported(input, assumptions);
  const warnings: string[] = [...input.warnings];
  const firstYear = startYear(input);
  const lastYear = Math.max(...input.persons.map((person) => birthYear(person) + person.planningAge));
  if (lastYear < firstYear || lastYear - firstYear > 150) throw new Error('Cash-flow projection is outside the supported planning horizon.');

  const primary = input.persons.find((person) => person.role === 'PRIMARY') ?? input.persons[0];
  const spouse = input.persons.find((person) => person.role === 'SPOUSE') ?? null;
  const retirementYear = Math.max(firstYear, yearAtAgeMonths(primary, primary.retirementAgeMonths));
  let accounts: AccountState = input.accounts.map((account) => ({ ...account }));
  const rows: CashFlowRow[] = [];
  const projectedMagi: Record<string, number> = { ...input.historicalMagi };
  let portfolioAtRetirement: number | null = null;
  let depletionAge: number | null = null;
  let lifetimeFederalTax = 0;
  let survivorIncomeDropMonthly = 0;
  let priorSocialSecurity: number | null = null;

  if (input.accounts.some((account) => account.type === 'HSA' && account.balance > 0 && account.hsaQualified !== true)) {
    warnings.push('HSA qualified-use status is not confirmed for at least one balance; that HSA is retained but never used to fund the projection.');
  }
  if (input.accounts.some((account) => account.type === 'ANNUITY' && account.annuityQualification === 'NONQUALIFIED')) {
    warnings.push('Nonqualified annuity cash value is retained in the taxable-bucket balance but is not used for withdrawals because surrender terms and taxable basis are not supplied.');
  }
  if (input.accounts.some((account) => account.type === 'CASH_VALUE_LIFE' && account.balance > 0)) {
    warnings.push('Cash-value life insurance is excluded from modeled cash-flow funding and ending legacy because loan/surrender terms are not supplied.');
  }
  if (assumptions.stateTaxRate === null) warnings.push('No state tax estimate is included because no planning state tax rate was supplied.');
  warnings.push('Returns are applied after that year’s distributions and retained cash, using the supplied household return policy uniformly because bucket-specific return assumptions are unavailable.');
  warnings.push('One-time goal amounts and CashFlowOptions.extraExpenses are treated as nominal amounts in their stated year; they are not additionally inflated.');
  warnings.push('Mortgage and debt payments are assumed included in the supplied spending budgets and are not deducted again from cash flow.');
  warnings.push(`Annual rules after ${assumptions.annual.year} are explicit planning projections under ${assumptions.futureRulePolicy}; they are not verified future tax law.`);

  for (let year = firstYear; year <= lastYear; year += 1) {
    const rules = projectAnnualRules(assumptions.annual, year, assumptions.taxBracketInflation);
    const healthcareResult = healthcareCostAtYear(input, assumptions, year, projectedMagi);
    warnings.push(...healthcareResult.warnings);
    const socialSecurityResult = householdBenefitsAtYear(input, assumptions, year);
    warnings.push(...socialSecurityResult.warnings);
    const socialSecurity = roundMoney(socialSecurityResult.annual);
    if (priorSocialSecurity !== null && socialSecurity < priorSocialSecurity) {
      survivorIncomeDropMonthly = Math.max(survivorIncomeDropMonthly, roundMoney((priorSocialSecurity - socialSecurity) / 12));
    }
    priorSocialSecurity = socialSecurity;

    const income = incomeForYear(input, assumptions, year, warnings);
    const spending = annualSpending(input, assumptions, year);
    const goals = annualGoals(input, options, year);
    const healthcare = roundMoney(healthcareResult.annual);
    const nonPortfolioCashIncome = roundMoney(income.wages + socialSecurity + income.pension + income.annuity + income.otherIncome);
    const outflowsBeforeTax = roundMoney(spending + goals + (input.healthcareIncludedInSpending ? 0 : healthcare));
    // Keep this signed until tax is known: wages/income left after the living budget can
    // fund tax, so tax must not automatically create an asset draw for a working spouse.
    const netCashBeforeTax = roundMoney(outflowsBeforeTax - nonPortfolioCashIncome);

    if (year === retirementYear) portfolioAtRetirement = modeledPortfolioTotal(accounts);
    const mandatoryState = copyAccounts(accounts);
    const rmd = withdrawRmds(mandatoryState, input, rules, year, warnings);
    const requestedConversion = options.rothConversions?.[String(year)] ?? 0;
    requireFiniteNonNegative(requestedConversion, `Roth conversion for ${year}`);
    const rothConversion = scheduledConversion(mandatoryState, requestedConversion, warnings);

    const ordinaryIncomeBase = roundMoney(income.wages + income.pension + income.annuity + income.otherIncome + rmd + rothConversion);
    const bracketTop = targetBracketTop(rules, input.filingStatus, assumptions.targetTaxBracket);
    if (bracketTop === null) warnings.push(`${year}: supplied target tax bracket ${assumptions.targetTaxBracket} is absent from annual rules; voluntary pre-tax withdrawals are used only after taxable funds are exhausted and no bracket room is assumed.`);

    let taxGuess = 0;
    let finalIteration: TaxIteration | null = null;
    let converged = false;
    for (let iteration = 0; iteration < MAX_TAX_ITERATIONS; iteration += 1) {
      const iterationAccounts = copyAccounts(mandatoryState);
      const portfolioNeedForPlan = roundMoney(Math.max(0, netCashBeforeTax + taxGuess));
      let remaining = portfolioNeedForPlan;
      const rmdApplied = roundMoney(Math.min(rmd, remaining));
      remaining = roundMoney(Math.max(0, remaining - rmdApplied));

      const hsaCap = hsaEligibleLimit(iterationAccounts, healthcare);
      const hsaWithdrawal = takeFromAccounts(
        iterationAccounts,
        Math.min(remaining, hsaCap),
        accountIsQualifiedHsa,
      );
      remaining = roundMoney(Math.max(0, remaining - hsaWithdrawal));

      const taxableWithdrawal = takeTaxableCash(iterationAccounts, remaining, warnings);
      remaining = roundMoney(Math.max(0, remaining - taxableWithdrawal.amount));

      const preliminaryTax = calculateTax({
        filingStatus: input.filingStatus,
        ordinaryIncome: ordinaryIncomeBase,
        socialSecurityAnnual: socialSecurity,
        longTermCapitalGains: taxableWithdrawal.capitalGains,
        ages: taxAges(input, year),
        taxYear: rules.year,
        separateLivedTogether: input.spouseLivedTogetherForMfs,
      }, rules);
      const room = bracketTop === null ? 0 : Math.max(0, bracketTop - preliminaryTax.taxableIncome);
      const pretaxWithdrawal = takeFromAccounts(
        iterationAccounts,
        Math.min(remaining, room),
        accountIsVoluntaryPretax,
        (account) => account.type === 'TRAD_IRA' ? 0 : account.type === 'K401_PRETAX' ? 1 : 2,
      );
      remaining = roundMoney(Math.max(0, remaining - pretaxWithdrawal));

      const rothWithdrawal = takeFromAccounts(
        iterationAccounts,
        remaining,
        accountIsRoth,
        (account) => account.type === 'ROTH_IRA' ? 0 : 1,
      );
      remaining = roundMoney(Math.max(0, remaining - rothWithdrawal));

      const ordinaryIncome = roundMoney(ordinaryIncomeBase + pretaxWithdrawal);
      const federal = calculateTax({
        filingStatus: input.filingStatus,
        ordinaryIncome,
        socialSecurityAnnual: socialSecurity,
        longTermCapitalGains: taxableWithdrawal.capitalGains,
        ages: taxAges(input, year),
        taxYear: rules.year,
        separateLivedTogether: input.spouseLivedTogetherForMfs,
      }, rules);
      const stateTax = stateTaxEstimate(assumptions.stateTaxRate, ordinaryIncome, federal.taxableSocialSecurity, taxableWithdrawal.capitalGains);
      const calculatedTax = roundMoney(federal.federalTax + stateTax);
      const actualPortfolioFunding = roundMoney(rmdApplied + hsaWithdrawal + taxableWithdrawal.amount + pretaxWithdrawal + rothWithdrawal);
      const actualNeed = roundMoney(Math.max(0, netCashBeforeTax + calculatedTax));
      const unmetNeed = roundMoney(Math.max(0, actualNeed - actualPortfolioFunding));
      const cashSurplus = roundMoney(Math.max(0, nonPortfolioCashIncome + rmd - outflowsBeforeTax - calculatedTax));
      finalIteration = {
        accounts: iterationAccounts,
        hsaWithdrawal,
        taxableWithdrawal,
        pretaxWithdrawal,
        rothWithdrawal,
        federalTax: federal.federalTax,
        stateTax,
        magi: federal.magi,
        taxConverged: false,
        portfolioNeed: actualNeed,
        actualPortfolioFunding,
        cashSurplus,
        unmetNeed,
      };
      if (Math.abs(calculatedTax - taxGuess) <= CENT) {
        finalIteration.taxConverged = true;
        converged = true;
        break;
      }
      taxGuess = calculatedTax;
    }

    if (!finalIteration) throw new Error('Cash-flow tax iteration did not execute.');
    if (!converged) {
      warnings.push(`${year}: cash-flow tax/withdrawal iteration did not converge within ${MAX_TAX_ITERATIONS} passes; the row is partial and any unresolved tax amount is shown as unmet need.`);
    }
    if (finalIteration.cashSurplus > 0) addCash(finalIteration.accounts, primary.role, finalIteration.cashSurplus);
    const beforeReturn = modeledPortfolioTotal(finalIteration.accounts);
    const returnRate = annualReturn(input, assumptions, options, year);
    applyReturn(finalIteration.accounts, returnRate);
    accounts = finalIteration.accounts;

    const buckets = bucketBalances(accounts);
    const endingBalance = modeledPortfolioTotal(accounts);
    const netPortfolioDraw = roundMoney(Math.min(finalIteration.portfolioNeed, finalIteration.actualPortfolioFunding));
    const failed = finalIteration.unmetNeed > 0 || !finalIteration.taxConverged;
    if (finalIteration.unmetNeed > 0) {
      warnings.push(`${year}: cash-flow shortfall of $${finalIteration.unmetNeed.toFixed(2)} is explicit; assets were not allowed to become negative.`);
      if (depletionAge === null) depletionAge = ageAtYear(primary.dob, year);
    } else if (beforeReturn === 0 && finalIteration.portfolioNeed > 0 && depletionAge === null) {
      depletionAge = ageAtYear(primary.dob, year);
    }

    rows.push({
      year,
      age: ageAtYear(primary.dob, year),
      spouseAge: spouse && isAliveInYear(spouse, year) ? ageAtYear(spouse.dob, year) : null,
      spending,
      healthcare,
      goals,
      socialSecurity,
      pension: income.pension,
      annuity: income.annuity,
      otherIncome: income.otherIncome,
      wages: income.wages,
      portfolioWithdrawal: roundMoney(rmd + finalIteration.hsaWithdrawal + finalIteration.taxableWithdrawal.amount + finalIteration.pretaxWithdrawal + finalIteration.rothWithdrawal),
      portfolioNeed: finalIteration.portfolioNeed,
      netPortfolioDraw,
      federalTax: finalIteration.federalTax,
      stateTax: finalIteration.stateTax,
      rmd,
      rothConversion,
      endingBalance,
      ...buckets,
      magi: finalIteration.magi,
      unmetNeed: finalIteration.unmetNeed,
      failed,
      taxConverged: finalIteration.taxConverged,
    });
    lifetimeFederalTax = roundMoney(lifetimeFederalTax + finalIteration.federalTax);
    projectedMagi[String(year)] = finalIteration.magi;
  }

  if (portfolioAtRetirement === null) {
    // A current retiree has a milestone in the past; the opening value of the first modeled row is the retirement value.
    portfolioAtRetirement = modeledPortfolioTotal(input.accounts.map((account) => ({ ...account })));
  }
  const retirementRow = rows.find((row) => row.year === retirementYear) ?? rows[0];
  let incomeCoverageRatio: number | null = null;
  if (input.essentialMonthlySpending === null) {
    warnings.push('Essential spending is unknown, so income coverage ratio is null rather than fabricated.');
  } else if (input.essentialMonthlySpending === 0) {
    warnings.push('Essential spending is zero, so income coverage ratio is undefined and reported as null.');
  } else if (retirementRow) {
    const essential = roundMoney(input.essentialMonthlySpending * 12 * annualFactor(assumptions.inflation, retirementRow.year, assumptions.annual.year, 'General inflation'));
    const guaranteed = roundMoney(retirementRow.socialSecurity + retirementRow.pension + retirementRow.annuity + retirementRow.otherIncome);
    incomeCoverageRatio = roundMoney(guaranteed / essential);
  }

  const allWarnings = uniqueWarnings(warnings);
  return {
    status: allWarnings.length === 0 && !rows.some((row) => row.failed) ? 'COMPLETE' : 'PARTIAL',
    warnings: allWarnings,
    sources: uniqueWarnings([
      ...assumptions.annual.sources.map((source) => source.url),
      ...assumptions.sources.map((source) => source.url),
    ]),
    rows,
    retirementYear,
    portfolioAtRetirement: roundMoney(portfolioAtRetirement),
    depletionAge,
    endingLegacy: rows.length ? rows[rows.length - 1].endingBalance : 0,
    lifetimeFederalTax,
    incomeCoverageRatio,
    survivorIncomeDropMonthly,
  };
}
