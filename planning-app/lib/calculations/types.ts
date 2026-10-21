export type FilingStatus = 'SINGLE' | 'MARRIED_FILING_JOINTLY' | 'MARRIED_FILING_SEPARATELY' | 'HEAD_OF_HOUSEHOLD';
export type RiskProfile = 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
export type PersonRole = 'PRIMARY' | 'SPOUSE';
export type ModuleStatus = 'COMPLETE' | 'PARTIAL' | 'UNSUPPORTED';
/** How an MFS living-together fact was supplied or conservatively illustrated. */
export type MfsLivingTogetherTreatment = 'NOT_APPLICABLE' | 'CONFIRMED_LIVED_TOGETHER' | 'CONFIRMED_LIVED_APART' | 'UNKNOWN_CONSERVATIVE_LIVED_TOGETHER';
export interface ModuleMeta { status: ModuleStatus; warnings: string[]; sources: string[] }
export interface SourceRecord { key: string; url: string; title: string; verifiedAt: string; classification: 'OFFICIAL' | 'PLANNING_ASSUMPTION' | 'PROJECTED'; note?: string }
export interface TaxBracket { upTo: number | null; rate: number }
export interface IrmaaTier { upTo: number | null; partBMonthly: number; partDMonthly: number; upperExclusive?: boolean }
export interface AnnualRules {
  year: number;
  taxBrackets: Record<FilingStatus, TaxBracket[]>;
  standardDeduction: Record<FilingStatus, number>;
  additionalDeduction65: Record<FilingStatus, number>;
  seniorDeduction: { amount: number; phaseoutStart: Record<FilingStatus, number>; phaseoutRate: number; endYear: number; eligibleFilingStatuses: FilingStatus[] };
  capitalGainsThresholds: Record<FilingStatus, { zero: number; fifteen: number }>;
  contributions: { workplace: number; workplaceCatchup50: number; workplaceCatchup60to63: number; ira: number; iraCatchup50: number; hsaSelf: number; hsaFamily: number; hsaCatchup55: number };
  socialSecurity: { earningsUnderFra: number; earningsFraYear: number; taxableMaximum: number; cola: number; taxThresholds: Record<FilingStatus, { base1: number; base2: number; cap: number; separateLivedTogether?: boolean }> };
  medicare: { partBStandard: number; partDDeductible?: number; irmaaSingle: IrmaaTier[]; irmaaJoint: IrmaaTier[]; irmaaSeparate: IrmaaTier[] };
  rmdUniform: Record<string, number>;
  rmdJoint?: Record<string, number>;
  estateExemption: number;
  giftExclusion: number;
  qcdLimit: number;
  sources: SourceRecord[];
}
export interface PlanningAssumptions {
  year: number;
  version: string;
  annual: AnnualRules;
  inflation: number;
  healthcareInflation: number;
  socialSecurityCola: number;
  returnByRisk: Record<RiskProfile, number>;
  volatilityByRisk: Record<RiskProfile, number>;
  planningAgeDefault: number;
  planningAgeExcellentLongevity: number;
  planningAgePoorHealth: number;
  monteCarloRuns: number;
  monteCarloSeed: number;
  monteCarloTarget: number;
  preMedicareMonthly: number;
  supplementalMedicareMonthly: number;
  medicalOutOfPocketAnnual: number;
  ltcMonthly: number;
  ltcYears: number;
  ltcEventAge: number;
  stateTaxRate: number | null;
  stateEstateThreshold: number | null;
  taxBracketInflation: number;
  futureRulePolicy: 'PROJECT_CURRENT_RULES';
  targetTaxBracket: number;
  heirsTaxRate: number;
  realDiscountRate: number;
  targetEquity: Record<RiskProfile, number>;
  finalExpenses: number;
  survivorSpendingPercent: number;
  incomeReplacementYears: number;
  sources: SourceRecord[];
}
export interface PlanningPerson {
  role: PersonRole;
  name: string;
  dob: string;
  ageMonths: number;
  retirementAgeMonths: number;
  planningAge: number;
  earnedIncomeAnnual: number;
  employeeContributionRate: number;
  employerMatchRate: number;
  combinedIraContributionAnnual: number;
  iraContributionDestination: 'TRAD_IRA' | 'ROTH_IRA' | null;
  piaMonthly: number;
  claimAgeMonths: number | null;
  alreadyReceiving: boolean;
  currentBenefitMonthly: number | null;
  benefitStartAgeMonths: number | null;
  pensionMonthly: number;
  pensionStartAgeMonths: number | null;
  pensionSurvivorRate: number | null;
  pensionCola: boolean | null;
  annuityMonthly: number;
  annuityStartAgeMonths: number | null;
  annuityQualification: 'QUALIFIED' | 'NONQUALIFIED' | null;
  rentalOtherMonthly: number;
  rentalEndAgeMonths: number | null;
  partTimeAnnual: number;
  partTimeEndAgeMonths: number | null;
  healthStatus: string | null;
  lifeInsuranceDeathBenefit: number;
  lifeInsuranceType: string | null;
  governmentNoncoveredPension: boolean;
}
export interface PlanningAccount {
  owner: PersonRole;
  type: 'K401_PRETAX' | 'ROTH_401K' | 'TRAD_IRA' | 'ROTH_IRA' | 'HSA' | 'BROKERAGE' | 'CASH' | 'ANNUITY' | 'CASH_VALUE_LIFE';
  balance: number;
  costBasis: number | null;
  annuityQualification: 'QUALIFIED' | 'NONQUALIFIED' | null;
  hsaQualified: boolean | null;
}
/** An advisor-supplied hypothetical annuity income stream. It is never a carrier quote. */
export interface HypotheticalAnnuityIncome {
  owner: PersonRole;
  monthlyIncome: number;
  startAgeMonths: number;
  taxQualification: 'QUALIFIED' | 'NONQUALIFIED' | null;
  premium: number;
  fundingAccount: { owner: PersonRole; type: PlanningAccount['type'] };
}
export interface PlanningInput {
  asOfDate: string;
  clientName: string;
  filingStatus: FilingStatus;
  maritalStatus: string;
  state: string;
  persons: PlanningPerson[];
  accounts: PlanningAccount[];
  /** Empty for Base analyses. Optional to preserve existing PlanningInput callers. */
  hypotheticalAnnuities?: HypotheticalAnnuityIncome[];
  currentMonthlySpending: number;
  retirementMonthlySpending: number;
  essentialMonthlySpending: number | null;
  discretionaryMonthlySpending: number | null;
  healthcareIncludedInSpending: boolean;
  homeValue: number;
  mortgageBalance: number;
  mortgageMonthlyPayment: number;
  mortgagePayoffYear: number | null;
  debts: Array<{ name: string; balance: number; rate: number; monthlyPayment: number }>;
  goals: Array<{ name: string; amount: number; year: number }>;
  riskProfile: RiskProfile;
  riskScore: number;
  allocation: { stocks: number; bonds: number; cash: number } | null;
  familyLongevity: boolean | null;
  currentHealthCoverage: string | null;
  ltcInsured: boolean | null;
  ltcDailyBenefit: number | null;
  disabilityInsured: boolean | null;
  legacyGoal: number;
  annualCharity: number;
  dependents: number;
  dependentsSpecialNeeds: boolean;
  estate: Record<'will' | 'livingTrust' | 'financialPoa' | 'healthcareDirective' | 'updatedBeneficiaries', { status: 'YES' | 'NO' | 'UNSURE'; updatedYear: number | null }>;
  historicalMagi: Record<string, number>;
  /** Null means the MFS fact was not collected and has not been confirmed by an adviser. */
  spouseLivedTogetherForMfs: boolean | null;
  warnings: string[];
}
export interface TaxInput {
  filingStatus: FilingStatus;
  ordinaryIncome: number;
  socialSecurityAnnual?: number;
  taxExemptInterest?: number;
  longTermCapitalGains?: number;
  ages?: number[];
  taxYear?: number;
  /** Null means the MFS fact is unknown, not that the spouses lived apart. */
  separateLivedTogether?: boolean | null;
}
export interface CashFlowOptions {
  rothConversions?: Record<string, number>;
  extraExpenses?: Record<string, number>;
  returnByYear?: Record<string, number>;
}
/** Options passed to the one shared analysis orchestrator for a saved scenario. */
export interface AnalysisRunOptions {
  cashFlow?: CashFlowOptions;
  /** A validated scenario-level mean return used by the Monte Carlo engine. */
  monteCarloMeanReturn?: number;
  /** Explicit, user-visible limitations that belong in the saved result warning set. */
  warnings?: string[];
}
export interface MonteCarloInput {
  portfolio: number;
  annualWithdrawals: number[];
  meanReturn: number;
  volatility: number;
  runs?: number;
  seed?: number;
  startAge?: number;
}
export interface ReportBranding { advisorName: string; advisorEmail: string; advisorPhone: string | null; licenseNumbers: string | null; logoDataUrl?: string | null; coverText: string; disclosure: string; letter: string; letterApproved: boolean }
export interface ReportRenderInput { clientName: string; generatedAt: string; version: number; input: PlanningInput; assumptions: PlanningAssumptions; results: Record<string, unknown>; branding: ReportBranding; sections: string[]; coverNote: string; approvedRecommendations: Array<{ title: string; body: string; priority: string; owner?: string; targetDate?: string }>; scenarioName: string; checksum?: string }
