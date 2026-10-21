import { calculateCashFlow } from '@/lib/calculations/cash-flow';
import { simulationInput } from '@/lib/calculations/engine';
import { calculateMedicarePremium } from '@/lib/calculations/healthcare';
import { calculateMonteCarlo } from '@/lib/calculations/monte-carlo';
import { projectAnnualRules } from '@/lib/assumptions/defaults';
import { calculateTax } from '@/lib/calculations/tax';
import type { PlanningAssumptions, PlanningInput } from '@/lib/calculations/types';
import type {
  EvidenceFact,
  GeneratedRecommendation,
  GenerationOptions,
  RecommendationGeneration,
  RecommendationPriority,
  RecommendationRuleId,
  RecommendationSnapshot,
  RuleEvaluation,
  SolverEvidence,
  SupplementalFacts,
} from './types';
import { RULE_IDS } from './types';

const TARGET_SUCCESS = 85;
const SPENDING_CAPACITY_SUCCESS = 95;
const MAX_BINARY_ITERATIONS = 12;
const MAX_RETIREMENT_DELAY_YEARS = 5;

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}
function percent(value: number, fraction = false): string { return `${(fraction ? value * 100 : value).toFixed(1)}%`; }
function age(value: number): string { return Number.isInteger(value) ? String(value) : value.toFixed(1); }
function fact(label: string, value: string, provenance: EvidenceFact['provenance']): EvidenceFact { return { label, value, provenance }; }
function priorityWeight(value: RecommendationPriority): number { return value === 'HIGH' ? 3 : value === 'MEDIUM' ? 2 : 1; }

function baseEvaluation(ruleId: RecommendationRuleId, category: string, priority: RecommendationPriority, trigger: string): RuleEvaluation {
  return { ruleId, category, priority, trigger, eligible: false, evidence: [], unavailable: [] };
}

function asProposal(evaluation: RuleEvaluation, args: {
  title: string;
  body: string;
  nextStep: string;
  dollarImpact?: number | null;
  impactLabel?: string | null;
  lsrtHelp?: string | null;
}): GeneratedRecommendation {
  return {
    ruleId: evaluation.ruleId,
    category: evaluation.category,
    priority: evaluation.priority,
    sortOrder: 0,
    title: args.title,
    body: args.body,
    nextStep: args.nextStep,
    owner: 'Advisor and client',
    targetDate: null,
    dollarImpact: args.dollarImpact ?? null,
    impactLabel: args.impactLabel ?? null,
    lsrtHelp: args.lsrtHelp ?? null,
    evidence: evaluation,
    generated: true,
    custom: false,
  };
}

function calculateRerun(input: PlanningInput, assumptions: PlanningAssumptions): { successPercent: number; medianEnding: number } {
  // Uses the same shared cash-flow and fixed-seed Monte Carlo calculation as the analysis engine.
  const flow = calculateCashFlow(input, assumptions);
  const monteCarlo = calculateMonteCarlo(simulationInput(input, assumptions, flow), assumptions);
  return { successPercent: monteCarlo.successPercent, medianEnding: monteCarlo.medianEnding };
}

function solveR01Levers(input: PlanningInput, assumptions: PlanningAssumptions, baselineSuccessPercent: number): SolverEvidence[] {
  const unavailable = (lever: SolverEvidence['lever'], detail: string): SolverEvidence => ({
    lever, status: 'UNAVAILABLE', targetSuccessPercent: TARGET_SUCCESS, baselineSuccessPercent, achievedSuccessPercent: null, iterations: 0, detail,
  });
  const solve = (lever: SolverEvidence['lever'], trialInput: (amount: number) => PlanningInput, high: number, detail: (amount: number) => string): SolverEvidence => {
    if (!(high > 0) || !Number.isFinite(high)) return unavailable(lever, 'The input needed for this bounded solver is unavailable.');
    try {
      const maximum = calculateRerun(trialInput(high), assumptions);
      if (maximum.successPercent < TARGET_SUCCESS) {
        return { lever, status: 'UNAVAILABLE', targetSuccessPercent: TARGET_SUCCESS, baselineSuccessPercent, achievedSuccessPercent: maximum.successPercent, iterations: 1, detail: 'The target was not reached within this bounded real engine rerun.' };
      }
      let low = 0;
      let upper = high;
      let best = maximum;
      let iterations = 1;
      while (iterations < MAX_BINARY_ITERATIONS && upper - low > 1) {
        const middle = (low + upper) / 2;
        const result = calculateRerun(trialInput(middle), assumptions);
        iterations += 1;
        if (result.successPercent >= TARGET_SUCCESS) { upper = middle; best = result; }
        else low = middle;
      }
      return { lever, status: 'SOLVED', targetSuccessPercent: TARGET_SUCCESS, baselineSuccessPercent, achievedSuccessPercent: best.successPercent, iterations, detail: detail(upper) };
    } catch {
      return unavailable(lever, 'A bounded shared-engine rerun was unavailable; no replacement estimate was invented.');
    }
  };

  const reductions = solve('TRIM_SPENDING', (amount) => ({ ...structuredClone(input), retirementMonthlySpending: Math.max(0, input.retirementMonthlySpending - amount) }), input.retirementMonthlySpending, (amount) => `Trim modeled retirement spending by about ${money(amount)}/month.`);

  const worker = [...input.persons]
    .filter((person) => person.earnedIncomeAnnual > 0 && person.retirementAgeMonths > person.ageMonths && person.employeeContributionRate < 1)
    .sort((left, right) => right.earnedIncomeAnnual - left.earnedIncomeAnnual)[0];
  const additionalSavings = worker
    ? solve('SAVE_MORE', (amount) => {
      const next = structuredClone(input);
      const target = next.persons.find((person) => person.role === worker.role);
      if (!target) return next;
      target.employeeContributionRate = Math.min(1, worker.employeeContributionRate + (amount * 12) / worker.earnedIncomeAnnual);
      return next;
    }, (worker.earnedIncomeAnnual * (1 - worker.employeeContributionRate)) / 12, (amount) => `Increase modeled payroll deferrals by about ${money(amount)}/month for ${worker.name}, subject to plan limits.`)
    : unavailable('SAVE_MORE', 'No working person with modeled earned income and remaining payroll-deferral capacity is available.');

  const canDelay = input.persons.some((person) => person.retirementAgeMonths > person.ageMonths && person.retirementAgeMonths + 12 <= person.planningAge * 12);
  let later: SolverEvidence;
  if (!canDelay) later = unavailable('RETIRE_LATER', 'No modeled retirement date can be delayed within the stated planning horizon.');
  else {
    let achieved: number | null = null;
    let solvedYears: number | null = null;
    let iterations = 0;
    try {
      for (let years = 1; years <= MAX_RETIREMENT_DELAY_YEARS; years += 1) {
        const next = structuredClone(input);
        let moved = false;
        for (const person of next.persons) {
          if (person.retirementAgeMonths > person.ageMonths && person.retirementAgeMonths + years * 12 <= person.planningAge * 12) {
            person.retirementAgeMonths += years * 12;
            moved = true;
          }
        }
        if (!moved) break;
        const result = calculateRerun(next, assumptions);
        iterations += 1;
        achieved = result.successPercent;
        if (result.successPercent >= TARGET_SUCCESS) { solvedYears = years; break; }
      }
      later = solvedYears === null
        ? { lever: 'RETIRE_LATER', status: 'UNAVAILABLE', targetSuccessPercent: TARGET_SUCCESS, baselineSuccessPercent, achievedSuccessPercent: achieved, iterations, detail: `The ${MAX_RETIREMENT_DELAY_YEARS}-year bounded real rerun did not reach the target.` }
        : { lever: 'RETIRE_LATER', status: 'SOLVED', targetSuccessPercent: TARGET_SUCCESS, baselineSuccessPercent, achievedSuccessPercent: achieved, iterations, detail: `Delay each still-working modeled retirement date by ${solvedYears} year${solvedYears === 1 ? '' : 's'}.` };
    } catch {
      later = unavailable('RETIRE_LATER', 'A bounded shared-engine rerun was unavailable; no replacement estimate was invented.');
    }
  }
  return [later, additionalSavings, reductions];
}

function solveSpendingCapacity(input: PlanningInput, assumptions: PlanningAssumptions, baselineSuccessPercent: number, legacyGoal: number): SolverEvidence {
  const unavailable = (detail: string, achievedSuccessPercent: number | null = null, iterations = 0): SolverEvidence => ({
    lever: 'SPEND_MORE', status: 'UNAVAILABLE', targetSuccessPercent: SPENDING_CAPACITY_SUCCESS, baselineSuccessPercent, achievedSuccessPercent, iterations, detail,
  });
  if (input.retirementMonthlySpending < 0 || !Number.isFinite(input.retirementMonthlySpending)) return unavailable('Retirement spending is unavailable.');
  // A full additional current monthly spending amount is a deliberately finite search bound, not an asserted affordable amount.
  const high = Math.max(1, input.retirementMonthlySpending);
  try {
    const atHigh = calculateRerun({ ...structuredClone(input), retirementMonthlySpending: input.retirementMonthlySpending + high }, assumptions);
    if (atHigh.successPercent >= SPENDING_CAPACITY_SUCCESS && atHigh.medianEnding >= legacyGoal) {
      return { lever: 'SPEND_MORE', status: 'SOLVED', targetSuccessPercent: SPENDING_CAPACITY_SUCCESS, baselineSuccessPercent, achievedSuccessPercent: atHigh.successPercent, iterations: 1, detail: `Increase modeled retirement spending by at least ${money(high)}/month within the bounded search; review a wider range before relying on it.` };
    }
    let low = 0;
    let upper = high;
    let best = calculateRerun(structuredClone(input), assumptions);
    let iterations = 2;
    while (iterations < MAX_BINARY_ITERATIONS && upper - low > 1) {
      const middle = (low + upper) / 2;
      const result = calculateRerun({ ...structuredClone(input), retirementMonthlySpending: input.retirementMonthlySpending + middle }, assumptions);
      iterations += 1;
      if (result.successPercent >= SPENDING_CAPACITY_SUCCESS && result.medianEnding >= legacyGoal) { low = middle; best = result; }
      else upper = middle;
    }
    if (low < 1) return unavailable('No additional spending was supported by the bounded real rerun while preserving the stated success and legacy thresholds.', best.successPercent, iterations);
    return { lever: 'SPEND_MORE', status: 'SOLVED', targetSuccessPercent: SPENDING_CAPACITY_SUCCESS, baselineSuccessPercent, achievedSuccessPercent: best.successPercent, iterations, detail: `Increase modeled retirement spending by about ${money(low)}/month while the rerun remains at or above ${SPENDING_CAPACITY_SUCCESS}% success and the stated legacy goal.` };
  } catch {
    return unavailable('A bounded shared-engine rerun was unavailable; no spending capacity was invented.');
  }
}

/**
 * Purely evaluates all 25 documented rules. It reads only a saved calculation snapshot
 * plus explicitly supplied supplemental facts, and never prices, quotes, or projects a product.
 */
export function generateRecommendations(
  snapshot: RecommendationSnapshot,
  supplementalFacts: SupplementalFacts = {},
  options: GenerationOptions = {},
): RecommendationGeneration {
  const input = snapshot.input;
  const assumptions = snapshot.assumptions;
  const results = snapshot.results;
  const evaluations = new Map<RecommendationRuleId, RuleEvaluation>();
  const proposals: GeneratedRecommendation[] = [];
  const runSolvers = options.runSolvers !== false;
  const record = (evaluation: RuleEvaluation, proposal?: Parameters<typeof asProposal>[1]) => {
    evaluations.set(evaluation.ruleId, evaluation);
    if (evaluation.eligible && proposal) proposals.push(asProposal(evaluation, proposal));
  };
  const firstPerson = input.persons[0];
  const asOfYear = Number(input.asOfDate.slice(0, 4));
  const lsrtIncome = 'LSRT can help coordinate an educational review of income-floor options. Product eligibility, costs, terms, and payouts require separate analysis and are not shown here.';
  const lsrtProtection = 'LSRT can help coordinate an educational protection review. Coverage, eligibility, underwriting, premiums, and benefits require separate analysis and are not shown here.';

  // R01 — income / plan durability.
  {
    const e = baseEvaluation('R01', 'Income', 'HIGH', 'Monte Carlo success is below 70%.');
    const success = results.monteCarlo.successPercent;
    e.evidence.push(fact('Monte Carlo success', percent(success), 'ANALYSIS_RESULT'));
    if (success < 70) {
      e.eligible = true;
      e.solverEvidence = runSolvers ? solveR01Levers(input, assumptions, success) : [{ lever: 'TRIM_SPENDING', status: 'UNAVAILABLE', targetSuccessPercent: TARGET_SUCCESS, baselineSuccessPercent: success, achievedSuccessPercent: null, iterations: 0, detail: 'Refresh recommendations to run bounded shared-engine lever checks.' }];
      const solved = e.solverEvidence.filter((entry) => entry.status === 'SOLVED').map((entry) => entry.detail);
      const unavailable = e.solverEvidence.filter((entry) => entry.status === 'UNAVAILABLE').map((entry) => entry.detail);
      e.unavailable.push(...unavailable);
      record(e, {
        title: 'Review plan durability',
        body: `The current fixed-seed Monte Carlo result is ${percent(success)}. ${solved.length ? `Bounded shared-engine checks found: ${solved.join(' ')}` : 'No lever reached the 85% target within the bounded shared-engine checks.'} This is a planning illustration, not a guarantee.`,
        nextStep: 'Review the modeled spending, retirement-date, and savings assumptions before selecting an action.',
        dollarImpact: null,
        impactLabel: 'Bounded solver evidence',
      });
    } else { e.unavailable.push('The current success result does not meet this rule’s below-70% trigger.'); record(e); }
  }

  // R02 — essential income floor.
  {
    const e = baseEvaluation('R02', 'Income', 'HIGH', 'Income Coverage Ratio is below 1.0 for supplied essential expenses.');
    const ratio = results.cashFlow.incomeCoverageRatio;
    if (ratio === null || input.essentialMonthlySpending === null) {
      e.unavailable.push('Essential monthly spending is not supplied, so the income-coverage ratio is unavailable.');
      record(e);
    } else {
      const essentialAnnual = input.essentialMonthlySpending * 12;
      const guaranteedAnnual = essentialAnnual * ratio;
      const gap = Math.max(0, essentialAnnual - guaranteedAnnual);
      e.evidence.push(fact('Income Coverage Ratio', percent(ratio, true), 'ANALYSIS_RESULT'), fact('Annual essential spending', money(essentialAnnual), 'INPUT'), fact('Derived annual floor gap', money(gap), 'DERIVED'));
      if (ratio < 1) {
        e.eligible = true;
        record(e, { title: 'Review the essential-income floor', body: `Modeled guaranteed income covers ${percent(ratio, true)} of supplied essential spending, leaving a derived ${money(gap)}/year floor gap. Review the income sources and expenses with an advisor; no annuity premium or payout is modeled here.`, nextStep: 'Confirm essential expenses and review non-product and product-based ways to address the documented gap.', dollarImpact: gap, impactLabel: 'Derived annual essential-income gap', lsrtHelp: lsrtIncome });
      } else { e.unavailable.push('Modeled guaranteed income covers the supplied essential-spending floor.'); record(e); }
    }
  }

  // R03 — Social Security strategy.
  {
    const e = baseEvaluation('R03', 'Social Security', 'MEDIUM', 'Best modeled claiming strategy exceeds planned lifetime benefits by more than $25,000.');
    const difference = results.socialSecurity.lifetimeDifference;
    const plannedPrimary = results.socialSecurity.planned.claimAgesMonths.PRIMARY;
    const bestPrimary = results.socialSecurity.best.claimAgesMonths.PRIMARY;
    e.evidence.push(fact('Lifetime cumulative-benefit difference', money(difference), 'ANALYSIS_RESULT'));
    if (difference > 25_000 && plannedPrimary !== undefined && bestPrimary !== undefined) {
      e.eligible = true;
      record(e, { title: 'Review Social Security claiming timing', body: `The model’s best claiming combination is projected to produce ${money(difference)} more in lifetime cumulative benefits than the planned combination. Its primary claiming age is ${age(bestPrimary / 12)} rather than ${age(plannedPrimary / 12)}. Projection assumptions and survivor details require review.`, nextStep: 'Compare the claimed-age combinations, health, employment, and survivor assumptions before filing.', dollarImpact: difference, impactLabel: 'Modeled lifetime cumulative-benefit difference' });
    } else { e.unavailable.push('The modeled lifetime cumulative-benefit difference does not exceed $25,000, or a claim age is unavailable.'); record(e); }
  }

  // R04 — higher earner’s age-70 review.
  {
    const e = baseEvaluation('R04', 'Social Security', 'MEDIUM', 'Married household with higher earner planned to claim before age 70.');
    if (input.persons.length < 2) { e.unavailable.push('A spouse is not present in the planning input.'); record(e); }
    else {
      const higher = [...input.persons].sort((a, b) => b.piaMonthly - a.piaMonthly)[0];
      const personResult = results.socialSecurity.people.find((person) => person.role === higher.role);
      const claim = results.socialSecurity.planned.claimAgesMonths[higher.role];
      e.evidence.push(fact('Higher earner', higher.name, 'INPUT'), fact('Planned claim age', claim === undefined ? 'Unavailable' : age(claim / 12), 'ANALYSIS_RESULT'));
      if (!higher.alreadyReceiving && claim !== undefined && claim < 70 * 12 && personResult) {
        e.eligible = true;
        record(e, { title: 'Review higher-earner claim timing', body: `${higher.name} is the higher-PIA earner and is modeled to claim at ${age(claim / 12)}. The age-70 own-worker benefit in the Social Security calculation is ${money(personResult.at70)}/month; it is relevant to survivor-income review, not a guarantee of a survivor benefit.`, nextStep: 'Review survivor assumptions and Social Security filing choices before any claim is submitted.', dollarImpact: null, impactLabel: 'No product or guaranteed benefit figure' });
      } else { e.unavailable.push('The higher earner is already claiming, is modeled to claim at 70, or sufficient Social Security output is unavailable.'); record(e); }
    }
  }

  // R05 — early claim while working.
  {
    const e = baseEvaluation('R05', 'Social Security', 'HIGH', 'Claiming before full retirement age while modeled earned income continues.');
    const withholding = results.socialSecurity.planned.annualBenefits.find((point) => point.withheld > 0);
    const earlyWorker = input.persons.find((person) => {
      const claim = results.socialSecurity.planned.claimAgesMonths[person.role];
      const social = results.socialSecurity.people.find((candidate) => candidate.role === person.role);
      return person.earnedIncomeAnnual > 0 && claim !== undefined && social !== undefined && claim < social.fraMonths;
    });
    if (earlyWorker && withholding) {
      e.eligible = true;
      e.evidence.push(fact('Modeled withholding year', String(withholding.year), 'ANALYSIS_RESULT'), fact('Modeled withheld benefits', money(withholding.withheld), 'ANALYSIS_RESULT'));
      record(e, { title: 'Review the earnings-test effect', body: `${earlyWorker.name} is modeled to claim before full retirement age while earned income continues. The Social Security calculation shows about ${money(withholding.withheld)} withheld in ${withholding.year}; withheld payments are not treated as a permanent benefit loss.`, nextStep: 'Confirm expected wages and consult SSA before selecting a filing date.', dollarImpact: withholding.withheld, impactLabel: 'Modeled annual earnings-test withholding' });
    } else { e.unavailable.push('No modeled early-claim earnings-test withholding was found.'); record(e); }
  }

  // R06 — Roth conversion.
  {
    const e = baseEvaluation('R06', 'Tax', 'MEDIUM', 'A bounded Roth conversion schedule improves lifetime federal tax by more than $10,000.');
    const roth = results.roth;
    e.evidence.push(fact('Modeled lifetime federal-tax difference', money(roth.lifetimeTaxDifference), 'ANALYSIS_RESULT'), fact('Modeled conversion years', String(roth.schedule.length), 'ANALYSIS_RESULT'));
    if (roth.beneficial && roth.lifetimeTaxDifference > 10_000 && roth.schedule.length > 0) {
      const total = roth.schedule.reduce((sum, row) => sum + row.amount, 0);
      const start = roth.schedule[0].year;
      const end = roth.schedule.at(-1)?.year ?? start;
      e.eligible = true;
      record(e, { title: 'Review the modeled Roth conversion schedule', body: `The bounded shared-engine schedule converts ${money(total / roth.schedule.length)}/year on average from ${start} through ${end}, targeting the ${percent(assumptions.targetTaxBracket, true)} bracket. It projects ${money(roth.lifetimeTaxDifference)} lower lifetime federal tax. Each schedule row carries its own tax and IRMAA checks; discuss with a tax professional.`, nextStep: 'Review the annual conversion rows, cash to pay tax, basis, and IRMAA lookback facts before acting.', dollarImpact: roth.lifetimeTaxDifference, impactLabel: 'Modeled lifetime federal-tax reduction' });
    } else { e.unavailable.push(...roth.warnings.filter((warning) => /IRMAA|conversion|basis/i.test(warning))); if (!e.unavailable.length) e.unavailable.push('The model did not show a qualifying Roth conversion tax improvement above $10,000.'); record(e); }
  }

  // R07 — tax-free bucket.
  {
    const e = baseEvaluation('R07', 'Tax', 'MEDIUM', 'Tax-free assets are below 15% of confirmed three-bucket savings.');
    const included = results.netWorth.taxDiversification.includedBalance;
    if (included <= 0) { e.unavailable.push('No confirmed taxable, tax-deferred, or tax-free bucket balance is available.'); record(e); }
    else {
      const share = results.netWorth.taxFree / included;
      e.evidence.push(fact('Tax-free balance', money(results.netWorth.taxFree), 'ANALYSIS_RESULT'), fact('Confirmed three-bucket balance', money(included), 'ANALYSIS_RESULT'), fact('Tax-free share', percent(share, true), 'DERIVED'));
      if (share < 0.15) { e.eligible = true; record(e, { title: 'Review tax-free savings flexibility', body: `Only ${percent(share, true)} of the confirmed three-bucket balance is tax-free. Consider directing eligible new savings to Roth options after reviewing income limits, plan choices, and tax consequences.`, nextStep: 'Confirm account classifications and review savings-destination choices with a tax professional.', dollarImpact: null, impactLabel: 'Tax-free share of confirmed assets' }); }
      else { e.unavailable.push('Tax-free assets are at least 15% of the confirmed three-bucket balance.'); record(e); }
    }
  }

  // R08 — RMD point comparison, carefully limited to a same-row tax/IRMAA threshold check.
  {
    const e = baseEvaluation('R08', 'Tax', 'MEDIUM', 'Projected RMD-period income crosses a higher marginal bracket or an IRMAA threshold point comparison.');
    const candidate = results.cashFlow.rows.find((row) => {
      if (row.rmd <= 0) return false;
      try {
        const annual = projectAnnualRules(assumptions.annual, row.year, assumptions.taxBracketInflation);
        const withRmd = calculateTax({ filingStatus: input.filingStatus, ordinaryIncome: row.magi, ages: input.persons.map((person) => row.year - Number(person.dob.slice(0, 4))), taxYear: row.year, separateLivedTogether: input.spouseLivedTogetherForMfs }, annual);
        const withoutRmdPoint = calculateTax({ filingStatus: input.filingStatus, ordinaryIncome: Math.max(0, row.magi - row.rmd), ages: input.persons.map((person) => row.year - Number(person.dob.slice(0, 4))), taxYear: row.year, separateLivedTogether: input.spouseLivedTogetherForMfs }, annual);
        return withRmd.marginalRate > withoutRmdPoint.marginalRate;
      } catch { return false; }
    });
    if (candidate) {
      const annual = projectAnnualRules(assumptions.annual, candidate.year, assumptions.taxBracketInflation);
      const withRmd = calculateTax({ filingStatus: input.filingStatus, ordinaryIncome: candidate.magi, ages: input.persons.map((person) => candidate.year - Number(person.dob.slice(0, 4))), taxYear: candidate.year, separateLivedTogether: input.spouseLivedTogetherForMfs }, annual);
      const withoutRmdPoint = calculateTax({ filingStatus: input.filingStatus, ordinaryIncome: Math.max(0, candidate.magi - candidate.rmd), ages: input.persons.map((person) => candidate.year - Number(person.dob.slice(0, 4))), taxYear: candidate.year, separateLivedTogether: input.spouseLivedTogetherForMfs }, annual);
      e.eligible = true;
      e.evidence.push(fact('Projected RMD', money(candidate.rmd), 'ANALYSIS_RESULT'), fact('RMD year', String(candidate.year), 'ANALYSIS_RESULT'), fact('Marginal bracket point comparison', `${percent(withoutRmdPoint.marginalRate, true)} to ${percent(withRmd.marginalRate, true)}`, 'DERIVED'));
      record(e, { title: 'Review RMD-period tax exposure', body: `In ${candidate.year}, the projection includes an RMD of ${money(candidate.rmd)}. A same-row tax point comparison moves from a ${percent(withoutRmdPoint.marginalRate, true)} to ${percent(withRmd.marginalRate, true)} marginal bracket when that RMD amount is included. This is a threshold check, not a separate no-RMD tax return or IRMAA determination.`, nextStep: 'Review RMD timing, account basis, and tax planning with a qualified tax professional.', dollarImpact: null, impactLabel: 'RMD tax-threshold review' });
    } else {
      // Keep prior-tax/IRMAA limitations explicit. The calculator’s row has no independent no-RMD cash-flow scenario.
      const futureRmd = results.cashFlow.rows.find((row) => row.rmd > 0);
      if (futureRmd) {
        try {
          const MedicareYear = futureRmd.year + 2;
          const people = results.healthcare.rows.find((row) => row.year === MedicareYear)?.people.filter((person) => person.coverage === 'MEDICARE') ?? [];
          if (people.length) {
            const rules = projectAnnualRules(assumptions.annual, MedicareYear, assumptions.taxBracketInflation);
            const withRmd = calculateMedicarePremium(futureRmd.magi, input.filingStatus, rules, input.spouseLivedTogetherForMfs);
            const withoutRmd = calculateMedicarePremium(Math.max(0, futureRmd.magi - futureRmd.rmd), input.filingStatus, rules, input.spouseLivedTogetherForMfs);
            const delta = ((withRmd.partBMonthly + withRmd.partDMonthly) - (withoutRmd.partBMonthly + withoutRmd.partDMonthly)) * 12 * people.length;
            if (delta > 0) {
              e.eligible = true;
              e.evidence.push(fact('Projected RMD', money(futureRmd.rmd), 'ANALYSIS_RESULT'), fact('Two-year-later IRMAA point comparison', money(delta), 'DERIVED'));
              record(e, { title: 'Review RMD-period Medicare premium exposure', body: `A ${money(futureRmd.rmd)} RMD in ${futureRmd.year} changes the same-row MAGI used in a ${MedicareYear} two-year-lookback IRMAA point comparison by ${money(delta)}/year for the modeled Medicare-covered people. This is a threshold check, not a premium quote or a full no-RMD rerun.`, nextStep: 'Confirm MAGI, Medicare enrollment, and account-treatment facts with tax and Medicare professionals.', dollarImpact: delta, impactLabel: 'IRMAA threshold point comparison' });
            } else { e.unavailable.push('No projected RMD same-row bracket or two-year IRMAA point comparison crossed a threshold.'); record(e); }
          } else { e.unavailable.push('No modeled Medicare-covered person was available for the RMD two-year IRMAA point comparison.'); record(e); }
        } catch { e.unavailable.push('The RMD/IRMAA point comparison was unavailable; no IRMAA amount was invented.'); record(e); }
      } else { e.unavailable.push('No projected RMD is present in the cash-flow horizon.'); record(e); }
    }
  }

  // R09 — charitable giving / QCD eligibility.
  {
    const e = baseEvaluation('R09', 'Tax', 'LOW', 'Annual charitable giving is supplied and a household member is age 70½ or older.');
    const eligiblePerson = input.persons.find((person) => person.ageMonths >= 70.5 * 12);
    e.evidence.push(fact('Annual charitable giving', money(input.annualCharity), 'INPUT'));
    if (input.annualCharity > 0 && eligiblePerson) { e.eligible = true; e.evidence.push(fact('Age-eligible household member', eligiblePerson.name, 'INPUT')); record(e, { title: 'Review qualified charitable distributions', body: `${money(input.annualCharity)} of annual charitable giving is supplied, and ${eligiblePerson.name} is age 70½ or older. Review whether a qualified charitable distribution from an eligible IRA is appropriate; account eligibility and tax treatment must be confirmed.`, nextStep: 'Confirm IRA ownership, charity eligibility, and current QCD rules with a tax professional.', dollarImpact: null, impactLabel: 'Supplied annual charitable giving' }); }
    else { e.unavailable.push('No supplied annual charitable giving and age-70½ combination meets this rule.'); record(e); }
  }

  // R10 — employer-match review without inventing a match schedule.
  {
    const e = baseEvaluation('R10', 'Savings', 'MEDIUM', 'Employee contribution rate is below the supplied employer match rate.');
    const person = input.persons.find((candidate) => candidate.earnedIncomeAnnual > 0 && candidate.employeeContributionRate < candidate.employerMatchRate);
    if (person) { e.eligible = true; e.evidence.push(fact('Employee contribution rate', percent(person.employeeContributionRate, true), 'INPUT'), fact('Employer match rate', percent(person.employerMatchRate, true), 'INPUT')); e.unavailable.push('The plan’s match formula, vesting, and compensation definition are not supplied, so no unearned-match dollar amount is calculated.'); record(e, { title: 'Review employer-match participation', body: `${person.name}'s supplied employee contribution rate is ${percent(person.employeeContributionRate, true)} versus a ${percent(person.employerMatchRate, true)} employer-match rate. Review the plan formula and vesting schedule; no match dollar amount is shown because those terms are not supplied.`, nextStep: 'Obtain the plan match formula and confirm payroll elections before changing contributions.', dollarImpact: null, impactLabel: 'Match amount unavailable' }); }
    else { e.unavailable.push('No supplied working employee contribution rate is below the supplied employer match rate.'); record(e); }
  }

  // R11 — catch-up provisions based solely on supplied annual rules.
  {
    const e = baseEvaluation('R11', 'Savings', 'LOW', 'Age 50+ worker has modeled workplace deferrals below the applicable supplied annual limit.');
    const candidate = input.persons.map((person) => {
      const currentAge = person.ageMonths / 12;
      const catchup = currentAge >= 60 && currentAge < 64 ? assumptions.annual.contributions.workplaceCatchup60to63 : currentAge >= 50 ? assumptions.annual.contributions.workplaceCatchup50 : 0;
      const regular = assumptions.annual.contributions.workplace;
      const contribution = person.earnedIncomeAnnual * person.employeeContributionRate;
      return { person, currentAge, catchup, regular, contribution };
    }).find((entry) => entry.catchup > 0 && entry.person.earnedIncomeAnnual > 0 && entry.contribution < entry.regular + entry.catchup);
    if (candidate) { e.eligible = true; e.evidence.push(fact('Current age', age(candidate.currentAge), 'INPUT'), fact('Supplied annual catch-up amount', money(candidate.catchup), 'ASSUMPTION'), fact('Modeled employee deferral', money(candidate.contribution), 'DERIVED')); record(e, { title: 'Review workplace catch-up eligibility', body: `${candidate.person.name} is age ${age(candidate.currentAge)} and has a supplied annual workplace catch-up provision of up to ${money(candidate.catchup)} beyond the regular limit. The modeled employee deferral is below the regular-plus-catch-up limit; confirm plan eligibility and payroll treatment.`, nextStep: 'Confirm the plan’s current-year limit, payroll election, and any special catch-up rules before acting.', dollarImpact: null, impactLabel: 'Supplied annual catch-up provision' }); }
    else { e.unavailable.push('No supplied age-eligible working person is modeled below an applicable annual workplace catch-up limit.'); record(e); }
  }

  // R12 — cash reserves.
  {
    const e = baseEvaluation('R12', 'Savings', 'MEDIUM', 'Emergency fund is below six months of supplied current spending.');
    const months = results.netWorth.emergencyFundMonths;
    if (months === null) { e.unavailable.push('Current monthly spending is zero or unavailable, so emergency-fund months cannot be calculated.'); record(e); }
    else if (months < 6) { const target = input.currentMonthlySpending * 6; e.eligible = true; e.evidence.push(fact('Emergency fund months', `${months.toFixed(1)} months`, 'ANALYSIS_RESULT'), fact('Six-month cash target', money(target), 'DERIVED')); record(e, { title: 'Build a six-month cash reserve', body: `Modeled cash reserves cover ${months.toFixed(1)} months of supplied current spending. A six-month target is ${money(target)} based on the supplied monthly spending figure.`, nextStep: 'Confirm accessible cash and near-term obligations, then set a reserve-building plan.', dollarImpact: Math.max(0, target - results.netWorth.accountBreakdown.taxable.cash), impactLabel: 'Derived six-month cash-reserve gap' }); }
    else { e.unavailable.push('Modeled cash reserves cover at least six months of supplied current spending.'); record(e); }
  }

  // R13 — high-rate debt or mortgage that extends past retirement.
  {
    const e = baseEvaluation('R13', 'Debt', 'HIGH', 'Debt rate exceeds 8% or mortgage payoff year extends past a modeled retirement year.');
    const highRate = input.debts.find((debt) => debt.rate > 0.08);
    const retirementYear = Math.min(...input.persons.map((person) => asOfYear + Math.max(0, person.retirementAgeMonths - person.ageMonths) / 12));
    const lateMortgage = input.mortgagePayoffYear !== null && input.mortgagePayoffYear > retirementYear;
    if (highRate || lateMortgage) { e.eligible = true; if (highRate) e.evidence.push(fact('Debt above 8%', `${highRate.name}: ${percent(highRate.rate, true)}`, 'INPUT'), fact('Monthly payment', money(highRate.monthlyPayment), 'INPUT')); if (lateMortgage) e.evidence.push(fact('Mortgage payoff year', String(input.mortgagePayoffYear), 'INPUT'), fact('Earliest modeled retirement year', String(Math.floor(retirementYear)), 'DERIVED')); const subject = highRate ? highRate.name : 'Mortgage'; const payment = highRate ? ` The supplied monthly payment is ${money(highRate.monthlyPayment)}.` : ''; record(e, { title: 'Review debt before retirement', body: `${subject} meets the debt-review trigger.${payment} Review payoff timing, liquidity, taxes, and any prepayment terms. No interest-savings figure is shown because payoff timing and loan terms are not fully modeled.`, nextStep: 'Request current payoff statements and compare debt reduction with reserve and retirement-funding needs.', dollarImpact: null, impactLabel: 'Interest savings unavailable' }); }
    else { e.unavailable.push('No supplied debt rate exceeds 8%, and no mortgage payoff year is modeled after retirement.'); record(e); }
  }

  // R14 — pre-Medicare healthcare bridge from actual healthcare output.
  {
    const e = baseEvaluation('R14', 'Healthcare', 'MEDIUM', 'A modeled retirement age is before age 65.');
    const under65 = input.persons.filter((person) => person.retirementAgeMonths < 65 * 12);
    if (!under65.length) { e.unavailable.push('No modeled retirement age is before age 65.'); record(e); }
    else {
      const bridge = under65.map((person) => {
        const cost = results.healthcare.rows.reduce((sum, row) => {
          const entry = row.people.find((candidate) => candidate.role === person.role && candidate.coverage === 'PRE_MEDICARE');
          const atRetirement = row.year >= Number(person.dob.slice(0, 4)) + Math.floor(person.retirementAgeMonths / 12);
          return sum + (entry && atRetirement ? entry.annual : 0);
        }, 0);
        return { person, years: 65 - person.retirementAgeMonths / 12, cost };
      });
      const primary = bridge[0];
      e.eligible = true;
      e.evidence.push(fact('Years from retirement age to 65', primary.years.toFixed(1), 'DERIVED'), fact('Modeled pre-Medicare bridge cost', money(primary.cost), 'ANALYSIS_RESULT'));
      record(e, { title: 'Review pre-Medicare healthcare bridge', body: `${primary.person.name} has ${primary.years.toFixed(1)} modeled year(s) from retirement age to 65. The healthcare calculation includes ${money(primary.cost)} of pre-Medicare costs from retirement through Medicare eligibility, using planning assumptions rather than a carrier quote.`, nextStep: 'Confirm coverage options, enrollment timing, and income assumptions with a licensed health-insurance professional.', dollarImpact: primary.cost, impactLabel: 'Modeled pre-Medicare healthcare costs' });
    }
  }

  // R15 — only explicitly validated supplemental HSA facts.
  {
    const e = baseEvaluation('R15', 'Healthcare', 'LOW', 'Validated HSA eligibility and annual contribution are below the supplied annual HSA limit.');
    const hsa = supplementalFacts.hsa;
    if (!hsa) { e.unavailable.push('HSA eligibility, coverage type, and annual contribution were not supplied as validated supplemental facts.'); record(e); }
    else if (!hsa.eligible) { e.unavailable.push('The supplied supplemental fact says the household is not HSA-eligible.'); record(e); }
    else {
      const oldest = Math.max(...input.persons.map((person) => person.ageMonths / 12));
      const regular = hsa.coverage === 'FAMILY' ? assumptions.annual.contributions.hsaFamily : assumptions.annual.contributions.hsaSelf;
      const limit = regular + (oldest >= 55 ? assumptions.annual.contributions.hsaCatchup55 : 0);
      e.evidence.push(fact('Validated annual HSA contribution', money(hsa.annualContribution), 'SUPPLEMENTAL_FACT'), fact('Supplied annual HSA limit', money(limit), 'ASSUMPTION'));
      if (hsa.annualContribution < limit) { e.eligible = true; record(e, { title: 'Review HSA contribution capacity', body: `Validated supplemental facts indicate HSA eligibility and an annual contribution of ${money(hsa.annualContribution)} versus the supplied ${money(limit)} annual limit. Review eligibility months, payroll treatment, and tax rules before changing contributions.`, nextStep: 'Confirm HSA eligibility and contribution limits with the plan administrator or tax professional.', dollarImpact: limit - hsa.annualContribution, impactLabel: 'Unused supplied annual HSA contribution capacity' }); }
      else { e.unavailable.push('The supplied annual HSA contribution is at or above the supplied annual limit.'); record(e); }
    }
  }

  // R16 — LTC stress test, only when coverage is explicitly reported absent.
  {
    const e = baseEvaluation('R16', 'LTC', 'HIGH', 'No LTC coverage is reported and the actual LTC stress test reduces success by more than 10 points.');
    const ltc = results.ltc;
    if (input.ltcInsured !== false) { e.unavailable.push(input.ltcInsured === null ? 'LTC coverage status is unknown, so it is not treated as no coverage.' : 'LTC coverage is reported; this no-coverage rule does not apply.'); record(e); }
    else if (ltc.baseSuccessPercent === null || ltc.stressSuccessPercent === null) { e.unavailable.push('The LTC stress probability result is unavailable; no stress impact is invented.'); record(e); }
    else {
      const drop = ltc.baseSuccessPercent - ltc.stressSuccessPercent;
      e.evidence.push(fact('Base success', percent(ltc.baseSuccessPercent), 'ANALYSIS_RESULT'), fact('LTC stress success', percent(ltc.stressSuccessPercent), 'ANALYSIS_RESULT'), fact('Success-point change', `${drop.toFixed(1)} points lower`, 'ANALYSIS_RESULT'));
      if (drop > 10) { e.eligible = true; record(e, { title: 'Review long-term care exposure', body: `With no LTC coverage reported, the modeled single-event stress test changes success from ${percent(ltc.baseSuccessPercent)} to ${percent(ltc.stressSuccessPercent)} (${drop.toFixed(1)} points lower). This is an event illustration, not a policy quote, benefit, or coverage recommendation.`, nextStep: 'Confirm care preferences, existing coverage, and the event assumptions before reviewing planning options.', dollarImpact: ltc.legacyChange === null ? null : Math.abs(ltc.legacyChange), impactLabel: ltc.legacyChange === null ? 'Legacy impact unavailable' : 'Modeled LTC-stress legacy change', lsrtHelp: lsrtProtection }); }
      else { e.unavailable.push('The actual LTC stress test does not lower success by more than 10 points.'); record(e); }
    }
  }

  // R17 — insurance needs-method gap.
  {
    const e = baseEvaluation('R17', 'Protection', 'HIGH', 'Needs-method life-insurance gap exceeds $50,000, or a supported survivor-income drop exceeds 25%.');
    const gap = results.estate.insuranceNeed;
    e.evidence.push(fact('Needs-method coverage gap', money(gap), 'ANALYSIS_RESULT'));
    if (gap > 50_000) { e.eligible = true; record(e, { title: 'Review family protection needs', body: `The needs-method calculation shows a ${money(gap)} coverage gap. It is a planning estimate using stated debts, survivor-income assumptions, liquid assets, and existing coverage—not a carrier illustration, underwriting result, premium, or policy amount.`, nextStep: 'Confirm debts, survivor spending, existing coverage, and beneficiary needs before an insurance review.', dollarImpact: gap, impactLabel: 'Needs-method coverage gap', lsrtHelp: lsrtProtection }); }
    else { e.unavailable.push('The needs-method coverage gap does not exceed $50,000, and no supported 25% survivor-income-drop comparison is available.'); record(e); }
  }

  // R18 — disability coverage status.
  {
    const e = baseEvaluation('R18', 'Protection', 'MEDIUM', 'Working person under age 60 has explicitly reported no disability coverage.');
    const person = input.persons.find((candidate) => candidate.earnedIncomeAnnual > 0 && candidate.ageMonths < 60 * 12);
    if (person && input.disabilityInsured === false) { e.eligible = true; e.evidence.push(fact('Working person under 60', person.name, 'INPUT'), fact('Reported disability coverage', 'No', 'INPUT')); record(e, { title: 'Review disability-income protection', body: `${person.name} has modeled earned income, is under age 60, and the household reports no disability coverage. Review employer benefits, emergency reserves, and individual coverage needs; no benefit or premium is modeled.`, nextStep: 'Confirm existing employer and individual disability benefits before requesting any coverage review.', dollarImpact: null, impactLabel: 'Benefit amount unavailable' }); }
    else { e.unavailable.push(input.disabilityInsured === null ? 'Disability coverage status is unknown and is not treated as no coverage.' : 'No working person under 60 reports no disability coverage.'); record(e); }
  }

  // R19 — allocation drift.
  {
    const e = baseEvaluation('R19', 'Investments', 'MEDIUM', 'Current equity differs from the educational target by more than 15 percentage points.');
    const allocation = results.allocation;
    if (!allocation.current || !allocation.rebalancing) { e.unavailable.push('Current household allocation or an eligible-dollar illustration is unavailable.'); record(e); }
    else {
      const difference = Math.abs(allocation.current.stocks - allocation.target.currentEquity);
      e.evidence.push(fact('Current equity', percent(allocation.current.stocks, true), 'INPUT'), fact('Educational target equity', percent(allocation.target.currentEquity, true), 'ANALYSIS_RESULT'), fact('Difference', `${(difference * 100).toFixed(1)} points`, 'DERIVED'));
      if (difference > 0.15) { const stockChange = allocation.rebalancing.change.stocks; e.eligible = true; record(e, { title: 'Review allocation drift', body: `Current household equity is ${percent(allocation.current.stocks, true)} versus an educational target of ${percent(allocation.target.currentEquity, true)}. The household arithmetic illustration changes stocks by ${money(Math.abs(stockChange))}; it is not a trade instruction and excludes taxes, costs, holdings, and plan restrictions.`, nextStep: 'Review account holdings, tax consequences, liquidity, and risk tolerance before any allocation change.', dollarImpact: Math.abs(stockChange), impactLabel: 'Educational household allocation illustration' }); }
      else { e.unavailable.push('Current equity is within 15 percentage points of the educational target.'); record(e); }
    }
  }

  // R20 — near-retirement sequence risk, using the actual one-path sequence stress only.
  {
    const e = baseEvaluation('R20', 'Investments', 'HIGH', 'Within five years of retirement with supplied current equity above 70%.');
    const allocation = results.allocation.current;
    const yearsToRetirement = Math.min(...input.persons.map((person) => Math.max(0, (person.retirementAgeMonths - person.ageMonths) / 12)));
    if (!allocation) { e.unavailable.push('Current equity is unknown, so sequence-risk eligibility cannot be established.'); record(e); }
    else if (yearsToRetirement <= 5 && allocation.stocks > 0.7) { const stress = results.monteCarlo.sequenceStress; e.eligible = true; e.evidence.push(fact('Years to earliest retirement', yearsToRetirement.toFixed(1), 'DERIVED'), fact('Current equity', percent(allocation.stocks, true), 'INPUT'), fact('Sequence stress ending balance', money(stress.endingBalance), 'ANALYSIS_RESULT')); e.unavailable.push('The sequence-stress output is one deterministic -25% first-year path and does not calculate a success-rate change.'); record(e, { title: 'Review near-retirement sequence risk', body: `The household is ${yearsToRetirement.toFixed(1)} year(s) from the earliest modeled retirement with ${percent(allocation.stocks, true)} current equity. The actual -25% first-year sequence-stress path ends at ${money(stress.endingBalance)}${stress.ruined ? ' and is depleted' : ''}. It is not a success-rate comparison.`, nextStep: 'Review cash needs, the educational bucket output, and risk tolerance before changing investments.', dollarImpact: null, impactLabel: 'Success-rate impact unavailable' }); }
    else { e.unavailable.push('The household is not within five years of retirement with current equity above 70%.'); record(e); }
  }

  // R21 — estate documents.
  {
    const e = baseEvaluation('R21', 'Estate', 'HIGH', 'Will, power of attorney, or healthcare directive is missing or unsure.');
    const missing = results.estate.checklist.filter((item) => ['will', 'financialPoa', 'healthcareDirective'].includes(item.key) && (item.status === 'MISSING' || item.status === 'UNSURE'));
    if (missing.length) { e.eligible = true; e.evidence.push(fact('Documents requiring review', missing.map((item) => item.label).join(', '), 'ANALYSIS_RESULT')); record(e, { title: 'Review core estate documents', body: `The estate checklist reports: ${missing.map((item) => `${item.label} (${item.status.toLowerCase()})`).join(', ')}. This is an intake-based checklist, not a legal review.`, nextStep: 'Meet with a qualified estate attorney to confirm documents, authority, and current wishes.', dollarImpact: null, impactLabel: 'Legal review required' }); }
    else { e.unavailable.push('The intake-based checklist does not report a missing or unsure will, financial power of attorney, or healthcare directive.'); record(e); }
  }

  // R22 — educational trust discussion heuristic.
  {
    const e = baseEvaluation('R22', 'Estate', 'LOW', 'No living trust is reported and an educational trust-discussion criterion is present.');
    const noTrust = input.estate.livingTrust.status === 'NO';
    const estateValue = results.estate.estateTaxFlag.estimatedEstate;
    const criteria = estateValue > 500_000 || input.dependentsSpecialNeeds;
    e.evidence.push(fact('Estimated estate proxy', money(estateValue), 'ANALYSIS_RESULT'));
    if (noTrust && criteria) { e.eligible = true; const why = input.dependentsSpecialNeeds ? 'a dependent with special needs is reported' : 'the estimated estate proxy exceeds the $500,000 educational discussion heuristic'; record(e, { title: 'Discuss whether a living trust is appropriate', body: `No living trust is reported, and ${why}. This is an educational prompt only; it does not determine probate, tax, legal suitability, funding, or asset titling.`, nextStep: 'Discuss goals, asset ownership, beneficiaries, and state-specific considerations with an estate attorney.', dollarImpact: null, impactLabel: 'Educational estate-planning prompt' }); }
    else { e.unavailable.push('No reported-missing living trust plus supported educational criterion is present.'); record(e); }
  }

  // R23 — beneficiary review.
  {
    const e = baseEvaluation('R23', 'Estate', 'MEDIUM', 'Beneficiary designations are unsure, missing, or more than three years old.');
    const beneficiary = results.estate.checklist.find((item) => item.key === 'beneficiaryDesignations');
    if (beneficiary && ['MISSING', 'UNSURE', 'REVIEW_DUE'].includes(beneficiary.status)) { e.eligible = true; e.evidence.push(fact('Beneficiary checklist status', beneficiary.status, 'ANALYSIS_RESULT'), fact('Last updated year', beneficiary.lastUpdatedYear === null ? 'Unavailable' : String(beneficiary.lastUpdatedYear), 'INPUT')); record(e, { title: 'Review beneficiary designations', body: `The beneficiary checklist status is ${beneficiary.status.toLowerCase().replaceAll('_', ' ')}. Review beneficiary designations on each account and policy with the appropriate custodian and legal professional; the checklist does not verify account records.`, nextStep: 'Inventory account and policy designations, then confirm updates directly with each provider.', dollarImpact: null, impactLabel: 'Beneficiary review needed' }); }
    else { e.unavailable.push('The beneficiary checklist does not report a missing, unsure, or review-due status.'); record(e); }
  }

  // R24 — legacy shortfall, no product payout/premium.
  {
    const e = baseEvaluation('R24', 'Legacy', 'MEDIUM', 'Desired legacy exceeds projected median ending balance.');
    const goal = input.legacyGoal;
    const median = results.monteCarlo.medianEnding;
    if (goal <= 0) { e.unavailable.push('No desired legacy amount is supplied.'); record(e); }
    else { e.evidence.push(fact('Desired legacy', money(goal), 'INPUT'), fact('Projected median ending balance', money(median), 'ANALYSIS_RESULT')); if (goal > median) { const gap = goal - median; e.eligible = true; record(e, { title: 'Review the legacy-goal shortfall', body: `The supplied desired legacy is ${money(goal)} versus a projected Monte Carlo median ending balance of ${money(median)}, a ${money(gap)} difference. Discuss spending, savings, gifting, estate, and protection approaches; no life-insurance policy, premium, or payout is modeled.`, nextStep: 'Confirm the legacy goal and review alternatives with tax, estate, and insurance professionals as appropriate.', dollarImpact: gap, impactLabel: 'Median legacy-goal shortfall', lsrtHelp: lsrtProtection }); } else { e.unavailable.push('The projected median ending balance meets the supplied desired legacy amount.'); record(e); } }
  }

  // R25 — real bounded spending-capacity rerun.
  {
    const e = baseEvaluation('R25', 'Spending', 'LOW', 'Monte Carlo success is at least 95% and the supplied legacy goal is met at the median ending balance.');
    const success = results.monteCarlo.successPercent;
    const median = results.monteCarlo.medianEnding;
    const goal = input.legacyGoal;
    e.evidence.push(fact('Monte Carlo success', percent(success), 'ANALYSIS_RESULT'), fact('Median ending balance', money(median), 'ANALYSIS_RESULT'), fact('Desired legacy', money(goal), 'INPUT'));
    if (goal <= 0) { e.unavailable.push('No positive desired legacy amount is supplied, so this legacy-goal condition is not established.'); record(e); }
    else if (success >= SPENDING_CAPACITY_SUCCESS && median >= goal) {
      e.eligible = true;
      const solver = runSolvers ? solveSpendingCapacity(input, assumptions, success, goal) : { lever: 'SPEND_MORE' as const, status: 'UNAVAILABLE' as const, targetSuccessPercent: SPENDING_CAPACITY_SUCCESS, baselineSuccessPercent: success, achievedSuccessPercent: null, iterations: 0, detail: 'Refresh recommendations to run the bounded shared-engine spending-capacity check.' };
      e.solverEvidence = [solver];
      if (solver.status !== 'SOLVED') e.unavailable.push(solver.detail);
      const amount = /\$([\d,]+)/.exec(solver.detail)?.[1];
      record(e, { title: 'Review spending capacity', body: solver.status === 'SOLVED' ? `The current model is at ${percent(success)} success and its median ending balance meets the ${money(goal)} desired legacy. A bounded shared-engine rerun found: ${solver.detail} This is not a guarantee or an open-ended spending recommendation.` : `The current model is at ${percent(success)} success and its median ending balance meets the ${money(goal)} desired legacy. ${solver.detail}`, nextStep: 'Review the complete cash-flow, tax, healthcare, and legacy assumptions before increasing spending.', dollarImpact: amount ? Number(amount.replaceAll(',', '')) * 12 : null, impactLabel: amount ? 'Bounded modeled annual spending increase' : 'Spending capacity unavailable' });
    } else { e.unavailable.push('The current model does not simultaneously meet the 95% success and supplied median legacy-goal conditions.'); record(e); }
  }

  // The explicit final pass protects the all-rules contract even if a future edit omits a branch.
  for (const ruleId of RULE_IDS) if (!evaluations.has(ruleId)) evaluations.set(ruleId, { ...baseEvaluation(ruleId, 'Uncategorized', 'LOW', 'Rule evaluation was not implemented.'), unavailable: ['Rule evaluation is unavailable.'] });
  proposals.sort((left, right) => priorityWeight(right.priority) - priorityWeight(left.priority) || Math.abs(right.dollarImpact ?? 0) - Math.abs(left.dollarImpact ?? 0) || left.ruleId.localeCompare(right.ruleId));
  proposals.forEach((proposal, index) => { proposal.sortOrder = index; });
  return { evaluations: RULE_IDS.map((ruleId) => evaluations.get(ruleId)!), proposals };
}

export const evaluateRecommendations = generateRecommendations;
