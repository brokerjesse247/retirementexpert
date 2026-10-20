import type { Prisma } from '@prisma/client';
import type { IntakeData } from '@/lib/intake/schema';

const accountFields = [
  ['preTax401k', 'K401_PRETAX'], ['roth401k', 'ROTH_401K'], ['traditionalIra', 'TRAD_IRA'], ['rothIra', 'ROTH_IRA'],
  ['hsaBalance', 'HSA'], ['brokerage', 'BROKERAGE'], ['cashSavingsCds', 'CASH'], ['annuityCashValue', 'ANNUITY'], ['lifeInsuranceCashValue', 'CASH_VALUE_LIFE'],
] as const;
function cents(value: string | undefined): bigint | null { return value ? BigInt(value) * 100n : null; }
function numberOrNull(value: string | undefined): number | null { return value ? Number(value) : null; }
function decimalOrNull(value: string | undefined): string | null { return value || null; }
function dateOrNull(value: string | undefined): Date | null { return value ? new Date(`${value}T00:00:00.000Z`) : null; }

/** Exact relational units; unknown values remain unknown. Full intake is separately encrypted. */
export function normalizedIntake(data: IntakeData): Prisma.ClientUpdateInput {
  const owners = data.maritalStatus === 'MARRIED' ? ['primary', 'spouse'] as const : ['primary'] as const;
  const people = owners.map((owner) => {
    const person = data[owner];
    return {
      role: owner === 'primary' ? 'PRIMARY' as const : 'SPOUSE' as const,
      firstName: owner === 'primary' ? data.firstName : person.firstName,
      lastName: owner === 'primary' ? data.lastName : person.lastName,
      dob: dateOrNull(owner === 'primary' ? data.dob : person.dob),
      retirementAge: numberOrNull(person.retirementAge), earnedIncomeCents: cents(person.earnedIncome), piaCents: cents(person.pia),
      employeeContributionPct: decimalOrNull(person.employeeContributionPercent),
      employerMatchPct: decimalOrNull(person.employerMatchPercent),
    };
  });
  const accounts = owners.flatMap((owner) => {
    const person = data[owner];
    return accountFields.flatMap(([field, type]) => {
      const balance = cents(person[field]);
      if (balance === null) return [];
      return [{
        owner: owner === 'primary' ? 'PRIMARY' as const : 'SPOUSE' as const, type, balanceCents: balance,
        costBasisCents: field === 'brokerage' ? cents(person.brokerageCostBasis) : null,
        // The intake asks for a combined IRA/Roth contribution; owner-level data
        // is retained encrypted, not silently assigned to Roth IRA alone.
        annualContributionCents: null,
        employerMatchPct: type === 'K401_PRETAX' ? decimalOrNull(person.employerMatchPercent) : null,
      }];
    });
  });
  const incomes = owners.flatMap((owner) => {
    const person = data[owner];
    const personRole = owner === 'primary' ? 'PRIMARY' as const : 'SPOUSE' as const;
    const result: Prisma.IncomeStreamCreateWithoutClientInput[] = [];
    if (person.pensionMonthly !== '') result.push({ personRole, type: 'PENSION', monthlyCents: cents(person.pensionMonthly), startAge: numberOrNull(person.pensionStartAge), survivorPct: decimalOrNull(person.pensionSurvivorPercent), isColaLinked: person.pensionCola ? person.pensionCola === 'YES' : null });
    if (person.annuityMonthly !== '') result.push({ personRole, type: 'ANNUITY', monthlyCents: cents(person.annuityMonthly), startAge: numberOrNull(person.annuityStartAge) });
    if (person.rentalOtherMonthly !== '') result.push({ personRole, type: 'RENTAL', monthlyCents: cents(person.rentalOtherMonthly), endAge: numberOrNull(person.rentalEndAge) });
    // Part-time intake is annual: never save this amount as monthly income.
    if (person.partTimeIncome !== '') result.push({ personRole, type: 'PART_TIME', annualCents: cents(person.partTimeIncome), monthlyCents: null, endAge: numberOrNull(person.partTimeEndAge) });
    return result;
  });
  const expenses = [
    { kind: 'CURRENT_MONTHLY', amountCents: cents(data.expenses.currentMonthly), isEssential: null },
    { kind: 'RETIREMENT_MONTHLY', amountCents: cents(data.expenses.retirementMonthly), isEssential: null },
    { kind: 'ESSENTIAL_MONTHLY', amountCents: cents(data.expenses.essentialMonthly), isEssential: true },
    ...(data.expenses.discretionaryMonthly ? [{ kind: 'DISCRETIONARY_MONTHLY', amountCents: cents(data.expenses.discretionaryMonthly), isEssential: false }] : []),
  ];
  const score = data.riskAnswers.reduce((sum, answer) => sum + answer, 0);
  const profile = score <= 11 ? 'CONSERVATIVE' : score <= 18 ? 'MODERATE' : 'AGGRESSIVE';
  const estate = {
    willStatus: data.estate.will.status, trustStatus: data.estate.livingTrust.status,
    financialPoaStatus: data.estate.financialPoa.status, healthcareDirectiveStatus: data.estate.healthcareDirective.status,
    beneficiariesStatus: data.estate.updatedBeneficiaries.status, beneficiariesUpdatedYear: numberOrNull(data.estate.updatedBeneficiaries.updatedYear),
  };
  return {
    persons: { deleteMany: {}, create: people }, accounts: { deleteMany: {}, create: accounts },
    incomeStreams: { deleteMany: {}, create: incomes }, expenses: { deleteMany: {}, create: expenses },
    goals: { deleteMany: {}, create: data.oneTimeGoals.map((goal) => ({ label: goal.item, amountCents: cents(goal.amount), targetYear: Number(goal.year) })) },
    debts: { deleteMany: {}, create: data.debts.map((debt) => ({ label: debt.name, balanceCents: cents(debt.balance), ratePct: debt.rate, monthlyPaymentCents: cents(debt.monthlyPayment), payoffYear: null })) },
    estateDocs: { upsert: { create: estate, update: estate } },
    riskProfile: { upsert: { create: { score, profile, answers: JSON.stringify(data.riskAnswers) }, update: { score, profile, answers: JSON.stringify(data.riskAnswers) } } },
  };
}
export function intakeIdentity(data: IntakeData) { return { firstName: data.firstName, lastName: data.lastName, email: data.email.toLowerCase() }; }
