import type { MonteCarloInput, PlanningAssumptions, PlanningInput } from './types';
import { uniqueWarnings } from './math';
import { calculateNetWorth } from './net-worth';
import { calculateSocialSecurity } from './social-security';
import { calculateTaxes } from './tax';
import { calculateRmds } from './rmd';
import { calculateAccumulation } from './accumulation';
import { calculateHealthcare } from './healthcare';
import { calculateCashFlow } from './cash-flow';
import { calculateMonteCarlo } from './monte-carlo';
import { calculateWithdrawalStrategies } from './withdrawals';
import { calculateRothConversions } from './roth';
import { calculateLongTermCare } from './ltc';
import { calculateAllocation } from './allocation';
import { calculateEstateAndInsurance } from './estate';
import { calculateReadiness } from './readiness';

export const ENGINE_VERSION = 'retirementexpert-2.0.0';

export function simulationInput(input: PlanningInput, assumptions: PlanningAssumptions, flow: ReturnType<typeof calculateCashFlow>): MonteCarloInput {
  const rows = flow.rows.filter(row => row.year >= flow.retirementYear);
  return {
    portfolio: flow.portfolioAtRetirement,
    annualWithdrawals: rows.map(row => {
      const extended = row as unknown as Record<string, unknown>;
      if (typeof extended.portfolioNeed === 'number') return Math.max(0, extended.portfolioNeed);
      return Math.max(0, row.spending + row.healthcare + row.goals + row.federalTax + row.stateTax - row.wages - row.socialSecurity - row.pension - row.annuity - row.otherIncome);
    }),
    meanReturn: assumptions.returnByRisk[input.riskProfile],
    volatility: assumptions.volatilityByRisk[input.riskProfile],
    runs: assumptions.monteCarloRuns,
    seed: assumptions.monteCarloSeed,
    startAge: rows[0]?.age ?? Math.floor(input.persons[0].retirementAgeMonths / 12),
  };
}

export function runAnalysis(input: PlanningInput, assumptions: PlanningAssumptions) {
  const netWorth = calculateNetWorth(input, assumptions);
  const socialSecurity = calculateSocialSecurity(input, assumptions);
  const taxes = calculateTaxes(input, assumptions);
  const rmd = calculateRmds(input, assumptions);
  const accumulation = calculateAccumulation(input, assumptions);
  const healthcare = calculateHealthcare(input, assumptions);
  const cashFlow = calculateCashFlow(input, assumptions);
  const mcInput = simulationInput(input, assumptions, cashFlow);
  const monteCarlo = calculateMonteCarlo(mcInput, assumptions);
  const withdrawals = calculateWithdrawalStrategies(mcInput, assumptions);
  const roth = calculateRothConversions(input, assumptions);
  const ltc = calculateLongTermCare(input, assumptions, {
    calculateCashFlow: (i, a, options) => {
      const flow = options ? calculateCashFlow(i, a, options) : cashFlow;
      const simulated = simulationInput(i, a, flow);
      const rows = flow.rows.filter(row => row.year >= flow.retirementYear);
      return { endingLegacy: flow.endingLegacy, portfolioAtRetirement: simulated.portfolio, rows: rows.map((row, index) => ({ age: row.age, portfolioWithdrawal: simulated.annualWithdrawals[index] })) };
    },
    calculateMonteCarlo,
  });
  const allocation = calculateAllocation(input, assumptions, cashFlow.incomeCoverageRatio);
  const firstDeathYear = Math.min(...input.persons.map(p => Number(p.dob.slice(0, 4)) + p.planningAge));
  const survivorRow = input.persons.length > 1 ? cashFlow.rows.find(row => row.year === firstDeathYear + 1) : undefined;
  const survivorIncome = survivorRow ? (survivorRow.socialSecurity + survivorRow.pension + survivorRow.annuity + survivorRow.otherIncome + survivorRow.wages) / 12 : undefined;
  const estate = calculateEstateAndInsurance(input, assumptions, survivorIncome);
  const coverage = input.persons.reduce((sum, person) => sum + person.lifeInsuranceDeathBenefit, 0);
  const insuranceNeed = typeof estate.insuranceNeed === 'number' ? estate.insuranceNeed : null;
  const insuranceProtectionScore = insuranceNeed === null ? null : insuranceNeed <= 0 ? 100 : Math.min(100, coverage / (coverage + insuranceNeed) * 100);
  const estateValues = Object.values(input.estate);
  const estateDocsScore = estateValues.some(v => v.status === 'UNSURE') ? null : estateValues.filter(v => v.status === 'YES').length / estateValues.length * 100;
  const readiness = calculateReadiness({ monteCarloSuccess: monteCarlo.successPercent, incomeCoverageRatio: cashFlow.incomeCoverageRatio, taxDiversificationScore: netWorth.taxDiversificationScore, emergencyFundMonths: netWorth.emergencyFundMonths, insuranceProtectionScore, estateDocsScore });
  const results = { netWorth, socialSecurity, taxes, rmd, accumulation, healthcare, cashFlow, monteCarlo, withdrawals, roth, ltc, allocation, estate, readiness };
  const warnings = uniqueWarnings([
    ...input.warnings,
    ...Object.values(results).flatMap(result => { const metadata = result as unknown as { warnings?: string[]; meta?: { warnings?: string[] } }; return metadata.meta?.warnings ?? metadata.warnings ?? []; }),
    ...(assumptions.sources.some(source => source.key === 'advisor-rule-edits') ? ['Annual rule values were edited by the advisor and have not been independently reverified.'] : []),
  ]);
  return { engineVersion: ENGINE_VERSION, seed: assumptions.monteCarloSeed, results, warnings };
}
export type EngineResults = ReturnType<typeof runAnalysis>['results'];
