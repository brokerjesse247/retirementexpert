import { z } from 'zod';
import type { IntakeData } from '../intake/schema';
import type { PersonRole, PlanningAssumptions, PlanningInput, PlanningPerson, RiskProfile } from './types';
import { ageMonthsOn, dollars } from './math';

export const analysisOverridesSchema = z.object({
  primaryClaimAge: z.number().int().min(62).max(70).optional(),
  spouseClaimAge: z.number().int().min(62).max(70).optional(),
  primaryPlanningAge: z.number().int().min(80).max(110).optional(),
  spousePlanningAge: z.number().int().min(80).max(110).optional(),
  essentialMonthlySpending: z.number().finite().min(0).max(1e8).optional(),
  healthcareIncludedInSpending: z.boolean().optional(),
  primaryIraDestination: z.enum(['TRAD_IRA', 'ROTH_IRA']).optional(),
  spouseIraDestination: z.enum(['TRAD_IRA', 'ROTH_IRA']).optional(),
  historicalMagi: z.record(z.string().regex(/^20\d{2}$/), z.number().finite().min(0).max(1e12)).optional(),
  spouseLivedTogetherForMfs: z.boolean().optional(),
}).strict();
export type AnalysisOverrides = z.infer<typeof analysisOverridesSchema>;
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
      if (balance > 0) accounts.push({owner:role,type,balance,costBasis:type === 'BROKERAGE' && p.brokerageCostBasis !== '' ? dollars(p.brokerageCostBasis) : null,annuityQualification:p.annuityTaxQualification === 'QUALIFIED' || p.annuityTaxQualification === 'NONQUALIFIED' ? p.annuityTaxQualification : null,hsaQualified:yesNo(p.hsaEligibleForQualifiedExpenses)});
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
    asOfDate, clientName: persons.map((p) => p.name).join(' & '), filingStatus:data.filingStatus as PlanningInput['filingStatus'],maritalStatus:data.maritalStatus,state:data.state,
    persons,accounts,currentMonthlySpending:dollars(data.expenses.currentMonthly),retirementMonthlySpending:retirementMonthly,essentialMonthlySpending:essential,
    discretionaryMonthlySpending:data.expenses.discretionaryMonthly === '' ? (essential === null ? null : retirementMonthly - essential) : dollars(data.expenses.discretionaryMonthly),
    healthcareIncludedInSpending:overrides.healthcareIncludedInSpending ?? false,homeValue:dollars(data.home.value),mortgageBalance:dollars(data.home.mortgageBalance),
    mortgageMonthlyPayment:dollars(data.home.monthlyPayment),mortgagePayoffYear:optionalNumber(data.home.payoffYear),
    debts:data.debts.map((d)=>({name:d.name,balance:dollars(d.balance),rate:Number(d.rate)/100,monthlyPayment:dollars(d.monthlyPayment)})),
    goals:data.oneTimeGoals.map((g)=>({name:g.item,amount:dollars(g.amount),year:Number(g.year)})),riskProfile,riskScore,
    allocation:data.allocation.status === 'KNOWN' ? {stocks:Number(data.allocation.stocksPercent)/100,bonds:Number(data.allocation.bondsPercent)/100,cash:Number(data.allocation.cashPercent)/100} : null,
    familyLongevity:yesNo(data.health.familyLongevity),currentHealthCoverage:data.health.currentCoverage || null,ltcInsured:yesNo(data.health.longTermCareInsurance),
    ltcDailyBenefit:data.health.longTermCareDailyBenefit === '' ? null : dollars(data.health.longTermCareDailyBenefit),disabilityInsured:yesNo(data.health.disabilityInsurance),
    legacyGoal:dollars(data.legacyAmount),annualCharity:dollars(data.annualCharity),dependents:Number(data.dependents),dependentsSpecialNeeds:data.dependentsSpecialNeeds === 'YES',
    estate:Object.fromEntries(Object.entries(data.estate).map(([key,v])=>[key,{status:v.status,updatedYear:optionalNumber(v.updatedYear)}])) as PlanningInput['estate'],
    historicalMagi:overrides.historicalMagi ?? {},spouseLivedTogetherForMfs,warnings,
  };
}
