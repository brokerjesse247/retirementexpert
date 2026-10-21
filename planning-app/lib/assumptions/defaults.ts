import { roundMoney } from '../calculations/math';
import type {
  AnnualRules,
  FilingStatus,
  IrmaaTier,
  PlanningAssumptions,
  RiskProfile,
  SourceRecord,
  TaxBracket,
} from '../calculations/types';
import { RMD_TABLES_2026 } from './rmd-tables-2026';

const VERIFIED_AT = '2026-10-20';
const FILING_STATUSES: FilingStatus[] = [
  'SINGLE',
  'MARRIED_FILING_JOINTLY',
  'MARRIED_FILING_SEPARATELY',
  'HEAD_OF_HOUSEHOLD',
];
const RISK_PROFILES: RiskProfile[] = ['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'];
const PLANNING_SOURCE_URL = 'docs/engine-assumptions.md#planning-only-settings';
const MAX_ABSOLUTE_AMOUNT = 1e12;

type UnknownRecord = Record<string, unknown>;

type RmdTableImport = {
  uniform: Record<string, number>;
  joint: Record<string, Record<string, number>>;
  sources?: SourceRecord[];
  source?: SourceRecord;
};

const ANNUAL_SOURCES: SourceRecord[] = [
  source('annual.taxBrackets', 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf', 'IRS Revenue Procedure 2025-32'),
  source('annual.standardDeduction', 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf', 'IRS Revenue Procedure 2025-32'),
  source('annual.additionalDeduction65', 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf', 'IRS Revenue Procedure 2025-32'),
  source('annual.seniorDeduction', 'https://www.congress.gov/bill/119th-congress/house-bill/1/text', 'Public Law 119-21 senior deduction text'),
  source('annual.capitalGainsThresholds', 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf', 'IRS Revenue Procedure 2025-32'),
  source('annual.contributions.workplace', 'https://www.irs.gov/pub/irs-drop/n-25-67.pdf', 'IRS Notice 2025-67 retirement plan limits'),
  source('annual.contributions.ira', 'https://www.irs.gov/pub/irs-drop/n-25-67.pdf', 'IRS Notice 2025-67 retirement plan limits'),
  source('annual.contributions.hsa', 'https://www.irs.gov/publications/p15b', 'IRS Publication 15-B employer fringe benefits'),
  source('annual.socialSecurity.earningsUnderFra', 'https://www.ssa.gov/news/en/cola/factsheets/2026.html', 'SSA 2026 COLA fact sheet'),
  source('annual.socialSecurity.earningsFraYear', 'https://www.ssa.gov/news/en/cola/factsheets/2026.html', 'SSA 2026 COLA fact sheet'),
  source('annual.socialSecurity.taxableMaximum', 'https://www.ssa.gov/news/en/cola/factsheets/2026.html', 'SSA 2026 COLA fact sheet'),
  source('annual.socialSecurity.cola', 'https://www.ssa.gov/news/en/cola/factsheets/2026.html', 'SSA 2026 COLA fact sheet'),
  source('annual.socialSecurity.taxThresholds', 'https://www.irs.gov/publications/p915', 'IRS Publication 915 Social Security benefits'),
  source('annual.medicare.partBStandard', 'https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-deductibles', 'CMS 2026 Medicare Parts A and B premiums'),
  source('annual.medicare.irmaaSingle', 'https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-deductibles', 'CMS 2026 Medicare Parts A and B premiums'),
  source('annual.medicare.irmaaJoint', 'https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-deductibles', 'CMS 2026 Medicare Parts A and B premiums'),
  source('annual.medicare.irmaaSeparate', 'https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-deductibles', 'CMS 2026 Medicare Parts A and B premiums'),
  source('annual.estateExemption', 'https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill', 'IRS 2026 tax inflation adjustments'),
  source('annual.giftExclusion', 'https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill', 'IRS 2026 tax inflation adjustments'),
  source('annual.qcdLimit', 'https://www.irs.gov/pub/irs-drop/n-25-67.pdf', 'IRS Notice 2025-67 retirement plan limits'),
];

const PLANNING_SOURCES: SourceRecord[] = [
  planningSource('inflation'),
  planningSource('healthcareInflation'),
  planningSource('socialSecurityCola', 'The 2.5% projection is not the official 2026 2.8% COLA.'),
  planningSource('returnByRisk'),
  planningSource('volatilityByRisk'),
  planningSource('planningAgeDefault'),
  planningSource('planningAgeExcellentLongevity'),
  planningSource('planningAgePoorHealth'),
  planningSource('monteCarloRuns'),
  planningSource('monteCarloSeed'),
  planningSource('monteCarloTarget'),
  planningSource('preMedicareMonthly'),
  planningSource('supplementalMedicareMonthly'),
  planningSource('medicalOutOfPocketAnnual'),
  planningSource('ltcMonthly'),
  planningSource('ltcYears'),
  planningSource('ltcEventAge'),
  planningSource('stateTaxRate', 'Null intentionally means state income tax is not modeled.'),
  planningSource('stateEstateThreshold', 'Null intentionally means state estate tax is not modeled.'),
  planningSource('taxBracketInflation'),
  planningSource('futureRulePolicy'),
  planningSource('targetTaxBracket'),
  planningSource('heirsTaxRate'),
  planningSource('realDiscountRate'),
  planningSource('targetEquity'),
  planningSource('finalExpenses'),
  planningSource('survivorSpendingPercent'),
  planningSource('incomeReplacementYears'),
];

const RMD_SEED_2026 = rmdAnnualSeed();

/**
 * Current official annual inputs and editable planning settings. The object is deep-frozen
 * after validation so callers cannot accidentally mutate this shared seed.
 */
export const DEFAULT_ASSUMPTIONS: PlanningAssumptions = deepFreeze(validateAssumptions({
  year: 2026,
  version: '2026.1',
  annual: {
    year: 2026,
    taxBrackets: {
      MARRIED_FILING_JOINTLY: brackets([24800, 100800, 211400, 403550, 512450, 768700]),
      HEAD_OF_HOUSEHOLD: brackets([17700, 67450, 105700, 201750, 256200, 640600]),
      SINGLE: brackets([12400, 50400, 105700, 201775, 256225, 640600]),
      MARRIED_FILING_SEPARATELY: brackets([12400, 50400, 105700, 201775, 256225, 384350]),
    },
    standardDeduction: {
      SINGLE: 16100,
      MARRIED_FILING_JOINTLY: 32200,
      MARRIED_FILING_SEPARATELY: 16100,
      HEAD_OF_HOUSEHOLD: 24150,
    },
    additionalDeduction65: {
      SINGLE: 2050,
      MARRIED_FILING_JOINTLY: 1650,
      MARRIED_FILING_SEPARATELY: 1650,
      HEAD_OF_HOUSEHOLD: 2050,
    },
    seniorDeduction: {
      amount: 6000,
      phaseoutStart: {
        SINGLE: 75000,
        MARRIED_FILING_JOINTLY: 150000,
        MARRIED_FILING_SEPARATELY: 75000,
        HEAD_OF_HOUSEHOLD: 75000,
      },
      phaseoutRate: 0.06,
      endYear: 2028,
      eligibleFilingStatuses: ['SINGLE', 'MARRIED_FILING_JOINTLY', 'HEAD_OF_HOUSEHOLD'],
    },
    capitalGainsThresholds: {
      SINGLE: { zero: 49450, fifteen: 545500 },
      MARRIED_FILING_JOINTLY: { zero: 98900, fifteen: 613700 },
      MARRIED_FILING_SEPARATELY: { zero: 49450, fifteen: 306850 },
      HEAD_OF_HOUSEHOLD: { zero: 66200, fifteen: 579600 },
    },
    contributions: {
      workplace: 24500,
      workplaceCatchup50: 8000,
      workplaceCatchup60to63: 11250,
      ira: 7500,
      iraCatchup50: 1100,
      hsaSelf: 4400,
      hsaFamily: 8750,
      hsaCatchup55: 1000,
    },
    socialSecurity: {
      earningsUnderFra: 24480,
      earningsFraYear: 65160,
      taxableMaximum: 184500,
      cola: 0.028,
      // These statutory income-tax thresholds are not indexed under current law.
      taxThresholds: {
        SINGLE: { base1: 25000, base2: 34000, cap: 4500 },
        MARRIED_FILING_JOINTLY: { base1: 32000, base2: 44000, cap: 6000 },
        // Tax code applies the single thresholds only when MFS spouses lived apart all year.
        // Tax functions must use separateLivedTogether to apply the 85%-taxable exception.
        MARRIED_FILING_SEPARATELY: { base1: 25000, base2: 34000, cap: 4500, separateLivedTogether: true },
        HEAD_OF_HOUSEHOLD: { base1: 25000, base2: 34000, cap: 4500 },
      },
    },
    medicare: {
      partBStandard: 202.9,
      irmaaSingle: irmaa([
        [109000, 202.9, 0],
        [137000, 284.1, 14.5],
        [171000, 405.8, 37.5],
        [205000, 527.5, 60.4],
        [500000, 649.2, 83.3, true],
        [null, 689.9, 91],
      ]),
      irmaaJoint: irmaa([
        [218000, 202.9, 0],
        [274000, 284.1, 14.5],
        [342000, 405.8, 37.5],
        [410000, 527.5, 60.4],
        [750000, 649.2, 83.3, true],
        [null, 689.9, 91],
      ]),
      // This special schedule applies when MFS spouses lived together during the tax year.
      irmaaSeparate: irmaa([
        [109000, 202.9, 0],
        [391000, 649.2, 83.3, true],
        [null, 689.9, 91],
      ]),
    },
    rmdUniform: RMD_SEED_2026.rmdUniform,
    rmdJoint: RMD_SEED_2026.rmdJoint,
    estateExemption: 15000000,
    giftExclusion: 19000,
    qcdLimit: 111000,
    sources: [...ANNUAL_SOURCES, ...RMD_SEED_2026.sources],
  },
  // The fields below are editable hypothetical inputs, never official forecasts.
  inflation: 0.025,
  healthcareInflation: 0.05,
  socialSecurityCola: 0.025,
  returnByRisk: { CONSERVATIVE: 0.05, MODERATE: 0.065, AGGRESSIVE: 0.075 },
  volatilityByRisk: { CONSERVATIVE: 0.07, MODERATE: 0.11, AGGRESSIVE: 0.15 },
  planningAgeDefault: 95,
  planningAgeExcellentLongevity: 100,
  planningAgePoorHealth: 90,
  monteCarloRuns: 5000,
  monteCarloSeed: 42,
  monteCarloTarget: 0.85,
  preMedicareMonthly: 900,
  supplementalMedicareMonthly: 250,
  medicalOutOfPocketAnnual: 2500,
  ltcMonthly: 9000,
  ltcYears: 3,
  ltcEventAge: 82,
  stateTaxRate: null,
  stateEstateThreshold: null,
  taxBracketInflation: 0.025,
  futureRulePolicy: 'PROJECT_CURRENT_RULES',
  targetTaxBracket: 0.22,
  heirsTaxRate: 0.24,
  realDiscountRate: 0.03,
  targetEquity: { CONSERVATIVE: 0.35, MODERATE: 0.55, AGGRESSIVE: 0.75 },
  finalExpenses: 15000,
  survivorSpendingPercent: 0.75,
  incomeReplacementYears: 10,
  sources: PLANNING_SOURCES,
}));

/** Validates and defensively clones an editable assumptions object without mutating its input. */
export function validateAssumptions(value: unknown): PlanningAssumptions {
  const record = objectAt(value, 'assumptions');
  const annual = validateAnnualRules(record.annual, 'assumptions.annual');
  const year = integerAt(record.year, 'year', 1900, 3000);
  if (annual.year !== year) throw new Error('assumptions.year must equal assumptions.annual.year.');
  const planningAgeDefault = integerAt(record.planningAgeDefault, 'planningAgeDefault', 1, 130);
  const planningAgeExcellentLongevity = integerAt(record.planningAgeExcellentLongevity, 'planningAgeExcellentLongevity', 1, 130);
  const planningAgePoorHealth = integerAt(record.planningAgePoorHealth, 'planningAgePoorHealth', 1, 130);
  if (planningAgePoorHealth > planningAgeDefault || planningAgeDefault > planningAgeExcellentLongevity) {
    throw new Error('Planning ages must satisfy poor-health <= default <= excellent-longevity.');
  }

  const returnByRisk = riskRates(record.returnByRisk, 'returnByRisk', -0.99, 1);
  const volatilityByRisk = riskRates(record.volatilityByRisk, 'volatilityByRisk', 0, 1);
  const targetEquity = riskRates(record.targetEquity, 'targetEquity', 0, 1);
  assertNondecreasing(returnByRisk, 'returnByRisk');
  assertNondecreasing(volatilityByRisk, 'volatilityByRisk');
  assertNondecreasing(targetEquity, 'targetEquity');

  return {
    year,
    version: nonEmptyString(record.version, 'version'),
    annual,
    inflation: rateAt(record.inflation, 'inflation', -0.99, 1),
    healthcareInflation: rateAt(record.healthcareInflation, 'healthcareInflation', -0.99, 1),
    socialSecurityCola: rateAt(record.socialSecurityCola, 'socialSecurityCola', -0.99, 1),
    returnByRisk,
    volatilityByRisk,
    planningAgeDefault,
    planningAgeExcellentLongevity,
    planningAgePoorHealth,
    monteCarloRuns: integerAt(record.monteCarloRuns, 'monteCarloRuns', 1, 1_000_000),
    monteCarloSeed: integerAt(record.monteCarloSeed, 'monteCarloSeed', 0, 4_294_967_295),
    monteCarloTarget: rateAt(record.monteCarloTarget, 'monteCarloTarget', 0, 1),
    preMedicareMonthly: moneyAt(record.preMedicareMonthly, 'preMedicareMonthly'),
    supplementalMedicareMonthly: moneyAt(record.supplementalMedicareMonthly, 'supplementalMedicareMonthly'),
    medicalOutOfPocketAnnual: moneyAt(record.medicalOutOfPocketAnnual, 'medicalOutOfPocketAnnual'),
    ltcMonthly: moneyAt(record.ltcMonthly, 'ltcMonthly'),
    ltcYears: finiteAt(record.ltcYears, 'ltcYears', 0, 100),
    ltcEventAge: integerAt(record.ltcEventAge, 'ltcEventAge', 1, 130),
    stateTaxRate: nullableRateAt(record.stateTaxRate, 'stateTaxRate'),
    stateEstateThreshold: nullableMoneyAt(record.stateEstateThreshold, 'stateEstateThreshold'),
    taxBracketInflation: rateAt(record.taxBracketInflation, 'taxBracketInflation', -0.99, 1),
    futureRulePolicy: literalAt(record.futureRulePolicy, 'futureRulePolicy', 'PROJECT_CURRENT_RULES'),
    targetTaxBracket: rateAt(record.targetTaxBracket, 'targetTaxBracket', 0, 1),
    heirsTaxRate: rateAt(record.heirsTaxRate, 'heirsTaxRate', 0, 1),
    realDiscountRate: rateAt(record.realDiscountRate, 'realDiscountRate', -0.99, 1),
    targetEquity,
    finalExpenses: moneyAt(record.finalExpenses, 'finalExpenses'),
    survivorSpendingPercent: rateAt(record.survivorSpendingPercent, 'survivorSpendingPercent', 0, 1),
    incomeReplacementYears: finiteAt(record.incomeReplacementYears, 'incomeReplacementYears', 0, 100),
    sources: sourceRecords(record.sources, 'sources'),
  };
}

/**
 * Produces a deterministic indexed planning projection from a fully supplied base rule year.
 * It intentionally rejects historical requests: this helper cannot manufacture unverified past law.
 */
export function projectAnnualRules(base: AnnualRules, year: number, inflation: number): AnnualRules {
  const cleanBase = validateAnnualRules(base, 'base annual rules');
  const targetYear = integerAt(year, 'year', cleanBase.year, 3000);
  const projectionRate = rateAt(inflation, 'inflation', -0.99, 1);
  if (targetYear === cleanBase.year) return cleanBase;

  const factor = Math.pow(1 + projectionRate, targetYear - cleanBase.year);
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error('Projected annual-rule index factor is outside the supported range.');
  }
  const indexed = (amount: number, label: string): number => indexedMoney(amount, factor, label);
  const sourceNote = `Projected from ${cleanBase.year} source values to ${targetYear}; not verified future law.`;

  const projected: AnnualRules = {
    year: targetYear,
    taxBrackets: mapStatuses((status) => cleanBase.taxBrackets[status].map((bracket) => ({
      upTo: bracket.upTo === null ? null : indexed(bracket.upTo, `taxBrackets.${status}`),
      rate: bracket.rate,
    }))),
    standardDeduction: mapStatuses((status) => indexed(cleanBase.standardDeduction[status], `standardDeduction.${status}`)),
    additionalDeduction65: mapStatuses((status) => indexed(cleanBase.additionalDeduction65[status], `additionalDeduction65.${status}`)),
    seniorDeduction: {
      amount: targetYear > cleanBase.seniorDeduction.endYear
        ? 0
        : indexed(cleanBase.seniorDeduction.amount, 'seniorDeduction.amount'),
      phaseoutStart: mapStatuses((status) => indexed(cleanBase.seniorDeduction.phaseoutStart[status], `seniorDeduction.phaseoutStart.${status}`)),
      phaseoutRate: cleanBase.seniorDeduction.phaseoutRate,
      endYear: cleanBase.seniorDeduction.endYear,
      eligibleFilingStatuses: [...cleanBase.seniorDeduction.eligibleFilingStatuses],
    },
    capitalGainsThresholds: mapStatuses((status) => ({
      zero: indexed(cleanBase.capitalGainsThresholds[status].zero, `capitalGainsThresholds.${status}.zero`),
      fifteen: indexed(cleanBase.capitalGainsThresholds[status].fifteen, `capitalGainsThresholds.${status}.fifteen`),
    })),
    contributions: {
      workplace: indexed(cleanBase.contributions.workplace, 'contributions.workplace'),
      workplaceCatchup50: indexed(cleanBase.contributions.workplaceCatchup50, 'contributions.workplaceCatchup50'),
      workplaceCatchup60to63: indexed(cleanBase.contributions.workplaceCatchup60to63, 'contributions.workplaceCatchup60to63'),
      ira: indexed(cleanBase.contributions.ira, 'contributions.ira'),
      iraCatchup50: indexed(cleanBase.contributions.iraCatchup50, 'contributions.iraCatchup50'),
      hsaSelf: indexed(cleanBase.contributions.hsaSelf, 'contributions.hsaSelf'),
      hsaFamily: indexed(cleanBase.contributions.hsaFamily, 'contributions.hsaFamily'),
      hsaCatchup55: indexed(cleanBase.contributions.hsaCatchup55, 'contributions.hsaCatchup55'),
    },
    socialSecurity: {
      earningsUnderFra: indexed(cleanBase.socialSecurity.earningsUnderFra, 'socialSecurity.earningsUnderFra'),
      earningsFraYear: indexed(cleanBase.socialSecurity.earningsFraYear, 'socialSecurity.earningsFraYear'),
      taxableMaximum: indexed(cleanBase.socialSecurity.taxableMaximum, 'socialSecurity.taxableMaximum'),
      cola: cleanBase.socialSecurity.cola,
      // §86 thresholds are fixed by law and deliberately not indexed in planning projections.
      taxThresholds: mapStatuses((status) => ({ ...cleanBase.socialSecurity.taxThresholds[status] })),
    },
    medicare: {
      partBStandard: indexed(cleanBase.medicare.partBStandard, 'medicare.partBStandard'),
      ...(cleanBase.medicare.partDDeductible === undefined
        ? {}
        : { partDDeductible: indexed(cleanBase.medicare.partDDeductible, 'medicare.partDDeductible') }),
      irmaaSingle: projectIrmaa(cleanBase.medicare.irmaaSingle, indexed, 'medicare.irmaaSingle'),
      irmaaJoint: projectIrmaa(cleanBase.medicare.irmaaJoint, indexed, 'medicare.irmaaJoint'),
      irmaaSeparate: projectIrmaa(cleanBase.medicare.irmaaSeparate, indexed, 'medicare.irmaaSeparate'),
    },
    rmdUniform: cloneNumberRecord(cleanBase.rmdUniform),
    rmdJoint: cleanBase.rmdJoint === undefined ? undefined : cloneNumberRecord(cleanBase.rmdJoint),
    estateExemption: indexed(cleanBase.estateExemption, 'estateExemption'),
    giftExclusion: indexed(cleanBase.giftExclusion, 'giftExclusion'),
    qcdLimit: indexed(cleanBase.qcdLimit, 'qcdLimit'),
    sources: cleanBase.sources.map((item) => ({
      ...item,
      classification: 'PROJECTED',
      note: item.note ? `${item.note} ${sourceNote}` : sourceNote,
    })),
  };
  return validateAnnualRules(projected, 'projected annual rules');
}

function validateAnnualRules(value: unknown, label: string): AnnualRules {
  const record = objectAt(value, label);
  const taxBrackets = filingRecord(record.taxBrackets, `${label}.taxBrackets`, validateBrackets);
  const standardDeduction = filingNumberRecord(record.standardDeduction, `${label}.standardDeduction`, 0);
  const additionalDeduction65 = filingNumberRecord(record.additionalDeduction65, `${label}.additionalDeduction65`, 0);
  const senior = objectAt(record.seniorDeduction, `${label}.seniorDeduction`);
  const seniorDeduction = {
    amount: moneyAt(senior.amount, `${label}.seniorDeduction.amount`),
    phaseoutStart: filingNumberRecord(senior.phaseoutStart, `${label}.seniorDeduction.phaseoutStart`, 0),
    phaseoutRate: rateAt(senior.phaseoutRate, `${label}.seniorDeduction.phaseoutRate`, 0, 1),
    endYear: integerAt(senior.endYear, `${label}.seniorDeduction.endYear`, 1900, 3000),
    eligibleFilingStatuses: filingStatusList(senior.eligibleFilingStatuses, `${label}.seniorDeduction.eligibleFilingStatuses`),
  };
  const annualYear = integerAt(record.year, `${label}.year`, 1900, 3000);
  if (annualYear > seniorDeduction.endYear && seniorDeduction.amount !== 0) {
    throw new Error(`${label}.seniorDeduction.amount must be zero after its end year.`);
  }
  const capitalGainsThresholds = filingRecord(record.capitalGainsThresholds, `${label}.capitalGainsThresholds`, (entry, entryLabel) => {
    const item = objectAt(entry, entryLabel);
    const zero = moneyAt(item.zero, `${entryLabel}.zero`);
    const fifteen = moneyAt(item.fifteen, `${entryLabel}.fifteen`);
    if (fifteen < zero) throw new Error(`${entryLabel}.fifteen must be at least .zero.`);
    return { zero, fifteen };
  });

  const contributionsRecord = objectAt(record.contributions, `${label}.contributions`);
  const contributions = {
    workplace: moneyAt(contributionsRecord.workplace, `${label}.contributions.workplace`),
    workplaceCatchup50: moneyAt(contributionsRecord.workplaceCatchup50, `${label}.contributions.workplaceCatchup50`),
    workplaceCatchup60to63: moneyAt(contributionsRecord.workplaceCatchup60to63, `${label}.contributions.workplaceCatchup60to63`),
    ira: moneyAt(contributionsRecord.ira, `${label}.contributions.ira`),
    iraCatchup50: moneyAt(contributionsRecord.iraCatchup50, `${label}.contributions.iraCatchup50`),
    hsaSelf: moneyAt(contributionsRecord.hsaSelf, `${label}.contributions.hsaSelf`),
    hsaFamily: moneyAt(contributionsRecord.hsaFamily, `${label}.contributions.hsaFamily`),
    hsaCatchup55: moneyAt(contributionsRecord.hsaCatchup55, `${label}.contributions.hsaCatchup55`),
  };
  if (contributions.workplaceCatchup60to63 < contributions.workplaceCatchup50) {
    throw new Error(`${label}.contributions.workplaceCatchup60to63 must be at least the age-50 catch-up.`);
  }
  if (contributions.hsaFamily < contributions.hsaSelf) {
    throw new Error(`${label}.contributions.hsaFamily must be at least the self-only limit.`);
  }

  const socialSecurityRecord = objectAt(record.socialSecurity, `${label}.socialSecurity`);
  const socialSecurity = {
    earningsUnderFra: moneyAt(socialSecurityRecord.earningsUnderFra, `${label}.socialSecurity.earningsUnderFra`),
    earningsFraYear: moneyAt(socialSecurityRecord.earningsFraYear, `${label}.socialSecurity.earningsFraYear`),
    taxableMaximum: moneyAt(socialSecurityRecord.taxableMaximum, `${label}.socialSecurity.taxableMaximum`),
    cola: rateAt(socialSecurityRecord.cola, `${label}.socialSecurity.cola`, -0.99, 1),
    taxThresholds: filingRecord(socialSecurityRecord.taxThresholds, `${label}.socialSecurity.taxThresholds`, (entry, entryLabel) => {
      const threshold = objectAt(entry, entryLabel);
      const base1 = moneyAt(threshold.base1, `${entryLabel}.base1`);
      const base2 = moneyAt(threshold.base2, `${entryLabel}.base2`);
      const cap = moneyAt(threshold.cap, `${entryLabel}.cap`);
      if (base2 < base1) throw new Error(`${entryLabel}.base2 must be at least .base1.`);
      if (threshold.separateLivedTogether !== undefined && typeof threshold.separateLivedTogether !== 'boolean') {
        throw new Error(`${entryLabel}.separateLivedTogether must be boolean when supplied.`);
      }
      return threshold.separateLivedTogether === undefined ? { base1, base2, cap } : {
        base1, base2, cap, separateLivedTogether: threshold.separateLivedTogether,
      };
    }),
  };
  if (socialSecurity.earningsFraYear < socialSecurity.earningsUnderFra) {
    throw new Error(`${label}.socialSecurity.earningsFraYear must be at least earningsUnderFra.`);
  }

  const medicareRecord = objectAt(record.medicare, `${label}.medicare`);
  const medicare: AnnualRules['medicare'] = {
    partBStandard: moneyAt(medicareRecord.partBStandard, `${label}.medicare.partBStandard`),
    irmaaSingle: validateIrmaa(medicareRecord.irmaaSingle, `${label}.medicare.irmaaSingle`),
    irmaaJoint: validateIrmaa(medicareRecord.irmaaJoint, `${label}.medicare.irmaaJoint`),
    irmaaSeparate: validateIrmaa(medicareRecord.irmaaSeparate, `${label}.medicare.irmaaSeparate`),
  };
  if (medicareRecord.partDDeductible !== undefined) {
    medicare.partDDeductible = moneyAt(medicareRecord.partDDeductible, `${label}.medicare.partDDeductible`);
  }
  [medicare.irmaaSingle, medicare.irmaaJoint, medicare.irmaaSeparate].forEach((tiers, index) => {
    if (tiers[0].partBMonthly !== medicare.partBStandard) {
      throw new Error(`${label}.medicare IRMAA schedule ${index + 1} must start at the standard Part B premium.`);
    }
  });

  return {
    year: annualYear,
    taxBrackets,
    standardDeduction,
    additionalDeduction65,
    seniorDeduction,
    capitalGainsThresholds,
    contributions,
    socialSecurity,
    medicare,
    rmdUniform: factorRecord(record.rmdUniform, `${label}.rmdUniform`),
    ...(record.rmdJoint === undefined ? {} : { rmdJoint: factorRecord(record.rmdJoint, `${label}.rmdJoint`) }),
    estateExemption: moneyAt(record.estateExemption, `${label}.estateExemption`),
    giftExclusion: moneyAt(record.giftExclusion, `${label}.giftExclusion`),
    qcdLimit: moneyAt(record.qcdLimit, `${label}.qcdLimit`),
    sources: sourceRecords(record.sources, `${label}.sources`),
  };
}

function validateBrackets(value: unknown, label: string): TaxBracket[] {
  if (!Array.isArray(value) || value.length < 2) throw new Error(`${label} must have at least two brackets.`);
  let previousLimit = 0;
  let previousRate = -1;
  return value.map((entry, index) => {
    const bracket = objectAt(entry, `${label}[${index}]`);
    const isLast = index === value.length - 1;
    const upTo = bracket.upTo === null ? null : moneyAt(bracket.upTo, `${label}[${index}].upTo`);
    if ((upTo === null) !== isLast) throw new Error(`${label} must have a null upper bound only in its final bracket.`);
    if (upTo !== null && upTo <= previousLimit) throw new Error(`${label} upper bounds must be strictly increasing.`);
    const rate = rateAt(bracket.rate, `${label}[${index}].rate`, 0, 1);
    if (rate <= previousRate) throw new Error(`${label} rates must be strictly increasing.`);
    if (upTo !== null) previousLimit = upTo;
    previousRate = rate;
    return { upTo, rate };
  });
}

function validateIrmaa(value: unknown, label: string): IrmaaTier[] {
  if (!Array.isArray(value) || value.length < 2) throw new Error(`${label} must have at least two tiers.`);
  let previousUpper = 0;
  let previousPartB = -1;
  let previousPartD = -1;
  return value.map((entry, index) => {
    const tier = objectAt(entry, `${label}[${index}]`);
    const isLast = index === value.length - 1;
    const upTo = tier.upTo === null ? null : moneyAt(tier.upTo, `${label}[${index}].upTo`);
    if ((upTo === null) !== isLast) throw new Error(`${label} must have a null upper bound only in its final tier.`);
    if (upTo !== null && upTo <= previousUpper) throw new Error(`${label} upper bounds must be strictly increasing.`);
    const partBMonthly = moneyAt(tier.partBMonthly, `${label}[${index}].partBMonthly`);
    const partDMonthly = moneyAt(tier.partDMonthly, `${label}[${index}].partDMonthly`);
    if (partBMonthly < previousPartB || partDMonthly < previousPartD) {
      throw new Error(`${label} premiums and surcharges must be nondecreasing.`);
    }
    if (tier.upperExclusive !== undefined && typeof tier.upperExclusive !== 'boolean') {
      throw new Error(`${label}[${index}].upperExclusive must be boolean when supplied.`);
    }
    if (upTo !== null) previousUpper = upTo;
    previousPartB = partBMonthly;
    previousPartD = partDMonthly;
    return tier.upperExclusive === undefined
      ? { upTo, partBMonthly, partDMonthly }
      : { upTo, partBMonthly, partDMonthly, upperExclusive: tier.upperExclusive };
  });
}

function sourceRecords(value: unknown, label: string): SourceRecord[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must contain source metadata.`);
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const item = objectAt(entry, `${label}[${index}]`);
    const key = nonEmptyString(item.key, `${label}[${index}].key`);
    if (seen.has(key)) throw new Error(`${label} has duplicate source key ${key}.`);
    seen.add(key);
    const verifiedAt = nonEmptyString(item.verifiedAt, `${label}[${index}].verifiedAt`);
    if (!isIsoDate(verifiedAt)) throw new Error(`${label}[${index}].verifiedAt must be a YYYY-MM-DD date.`);
    const classification = item.classification;
    if (classification !== 'OFFICIAL' && classification !== 'PLANNING_ASSUMPTION' && classification !== 'PROJECTED') {
      throw new Error(`${label}[${index}].classification is invalid.`);
    }
    const note = item.note === undefined ? undefined : nonEmptyString(item.note, `${label}[${index}].note`);
    return note === undefined
      ? {
        key,
        url: nonEmptyString(item.url, `${label}[${index}].url`),
        title: nonEmptyString(item.title, `${label}[${index}].title`),
        verifiedAt,
        classification,
      }
      : {
        key,
        url: nonEmptyString(item.url, `${label}[${index}].url`),
        title: nonEmptyString(item.title, `${label}[${index}].title`),
        verifiedAt,
        classification,
        note,
      };
  });
}

function rmdAnnualSeed(): Pick<AnnualRules, 'rmdUniform' | 'rmdJoint'> & { sources: SourceRecord[] } {
  const imported = RMD_TABLES_2026 as unknown as RmdTableImport;
  if (!imported || typeof imported !== 'object') {
    throw new Error('RMD_TABLES_2026 must be supplied by lib/assumptions/rmd-tables-2026.ts.');
  }
  const sources = imported.sources ?? (imported.source === undefined ? undefined : [imported.source]);
  jointFactorTable(imported.joint, 'RMD_TABLES_2026.joint');
  return {
    rmdUniform: factorRecord(imported.uniform, 'RMD_TABLES_2026.uniform'),
    rmdJoint: Object.fromEntries(Object.entries(imported.joint).flatMap(([ownerAge,row]) => Object.entries(row).map(([spouseAge,factor]) => [`${ownerAge}:${spouseAge}`,factor]))),
    sources: sourceRecords(sources, 'RMD_TABLES_2026.sources'),
  };
}

function factorRecord(value: unknown, label: string): Record<string, number> {
  const record = objectAt(value, label);
  const entries = Object.entries(record);
  if (entries.length === 0) throw new Error(`${label} must contain complete positive life-expectancy factors.`);
  return Object.fromEntries(entries.map(([key, factor]) => [
    nonEmptyString(key, `${label} key`),
    finiteAt(factor, `${label}.${key}`, Number.MIN_VALUE, MAX_ABSOLUTE_AMOUNT),
  ]));
}

function jointFactorTable(value: unknown, label: string): Record<string, Record<string, number>> {
  const record = objectAt(value, label);
  const entries = Object.entries(record);
  if (entries.length === 0) throw new Error(`${label} must contain complete Joint Life factors.`);
  return Object.fromEntries(entries.map(([ownerAge, spouseFactors]) => [
    nonEmptyString(ownerAge, `${label} owner age`),
    factorRecord(spouseFactors, `${label}.${ownerAge}`),
  ]));
}

function filingRecord<T>(value: unknown, label: string, parser: (entry: unknown, label: string) => T): Record<FilingStatus, T> {
  const record = objectAt(value, label);
  return mapStatuses((status) => {
    if (!(status in record)) throw new Error(`${label}.${status} is required.`);
    return parser(record[status], `${label}.${status}`);
  });
}

function filingNumberRecord(value: unknown, label: string, minimum: number): Record<FilingStatus, number> {
  return filingRecord(value, label, (entry, entryLabel) => finiteAt(entry, entryLabel, minimum, MAX_ABSOLUTE_AMOUNT));
}

function filingStatusList(value: unknown, label: string): FilingStatus[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty filing-status list.`);
  const result = value.map((status, index) => {
    if (!FILING_STATUSES.includes(status as FilingStatus)) throw new Error(`${label}[${index}] is not a filing status.`);
    return status as FilingStatus;
  });
  if (new Set(result).size !== result.length) throw new Error(`${label} must not have duplicate statuses.`);
  return result;
}

function riskRates(value: unknown, label: string, minimum: number, maximum: number): Record<RiskProfile, number> {
  const record = objectAt(value, label);
  return RISK_PROFILES.reduce((output, profile) => {
    if (!(profile in record)) throw new Error(`${label}.${profile} is required.`);
    output[profile] = rateAt(record[profile], `${label}.${profile}`, minimum, maximum);
    return output;
  }, {} as Record<RiskProfile, number>);
}

function assertNondecreasing(values: Record<RiskProfile, number>, label: string): void {
  for (let index = 1; index < RISK_PROFILES.length; index += 1) {
    if (values[RISK_PROFILES[index]] < values[RISK_PROFILES[index - 1]]) {
      throw new Error(`${label} must be nondecreasing from conservative to aggressive.`);
    }
  }
}

function mapStatuses<T>(mapper: (status: FilingStatus) => T): Record<FilingStatus, T> {
  return FILING_STATUSES.reduce((output, status) => {
    output[status] = mapper(status);
    return output;
  }, {} as Record<FilingStatus, T>);
}

function projectIrmaa(
  tiers: IrmaaTier[],
  index: (amount: number, label: string) => number,
  label: string,
): IrmaaTier[] {
  return tiers.map((tier, position) => ({
    upTo: tier.upTo === null ? null : index(tier.upTo, `${label}[${position}].upTo`),
    partBMonthly: index(tier.partBMonthly, `${label}[${position}].partBMonthly`),
    partDMonthly: index(tier.partDMonthly, `${label}[${position}].partDMonthly`),
    ...(tier.upperExclusive === undefined ? {} : { upperExclusive: tier.upperExclusive }),
  }));
}

function cloneNumberRecord(value: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(value).map(([key, amount]) => [key, amount]));
}

function indexedMoney(amount: number, factor: number, label: string): number {
  const result = amount * factor;
  if (!Number.isFinite(result) || Math.abs(result) > MAX_ABSOLUTE_AMOUNT) {
    throw new Error(`${label} projection is outside the supported amount range.`);
  }
  return roundMoney(result);
}

function objectAt(value: unknown, label: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as UnknownRecord;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

function finiteAt(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be a finite number between ${minimum} and ${maximum}.`);
  }
  return value;
}

function moneyAt(value: unknown, label: string): number {
  return finiteAt(value, label, 0, MAX_ABSOLUTE_AMOUNT);
}

function nullableMoneyAt(value: unknown, label: string): number | null {
  return value === null ? null : moneyAt(value, label);
}

function rateAt(value: unknown, label: string, minimum: number, maximum: number): number {
  return finiteAt(value, label, minimum, maximum);
}

function nullableRateAt(value: unknown, label: string): number | null {
  return value === null ? null : rateAt(value, label, 0, 1);
}

function integerAt(value: unknown, label: string, minimum: number, maximum: number): number {
  const number = finiteAt(value, label, minimum, maximum);
  if (!Number.isInteger(number)) throw new Error(`${label} must be an integer.`);
  return number;
}

function literalAt<T extends string>(value: unknown, label: string, literal: T): T {
  if (value !== literal) throw new Error(`${label} must equal ${literal}.`);
  return literal;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function source(key: string, url: string, title: string): SourceRecord {
  return { key, url, title, verifiedAt: VERIFIED_AT, classification: 'OFFICIAL' };
}

function planningSource(key: string, note?: string): SourceRecord {
  return {
    key: `planning.${key}`,
    url: PLANNING_SOURCE_URL,
    title: 'Approved planning defaults',
    verifiedAt: VERIFIED_AT,
    classification: 'PLANNING_ASSUMPTION',
    ...(note === undefined ? {} : { note }),
  };
}

function brackets(upperBounds: number[]): TaxBracket[] {
  const rates = [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];
  return [...upperBounds.map((upTo, index) => ({ upTo, rate: rates[index] })), { upTo: null, rate: rates[rates.length - 1] }];
}

function irmaa(rows: Array<[number | null, number, number, boolean?]>): IrmaaTier[] {
  return rows.map(([upTo, partBMonthly, partDMonthly, upperExclusive]) => ({
    upTo,
    partBMonthly,
    partDMonthly,
    ...(upperExclusive === undefined ? {} : { upperExclusive }),
  }));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach((child) => deepFreeze(child));
  }
  return value;
}
