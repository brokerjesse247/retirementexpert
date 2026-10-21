import { z } from 'zod';
import type { AnalysisSnapshot } from '@/lib/calculations/service';

export const RULE_IDS = [
  'R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10',
  'R11', 'R12', 'R13', 'R14', 'R15', 'R16', 'R17', 'R18', 'R19', 'R20',
  'R21', 'R22', 'R23', 'R24', 'R25',
] as const;

export type RecommendationRuleId = typeof RULE_IDS[number];
export type RecommendationPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type RecommendationStatus = 'PROPOSED' | 'APPROVED' | 'EDITED' | 'REMOVED';

export const supplementalFactsSchema = z.object({
  hsa: z.object({
    eligible: z.boolean(),
    coverage: z.enum(['SELF', 'FAMILY']),
    annualContribution: z.number().finite().min(0).max(1_000_000_000),
  }).strict().optional(),
}).strict();

export type SupplementalFacts = z.infer<typeof supplementalFactsSchema>;

export type EvidenceFact = {
  label: string;
  value: string;
  provenance: 'ANALYSIS_RESULT' | 'INPUT' | 'ASSUMPTION' | 'SUPPLEMENTAL_FACT' | 'DERIVED';
};

export type SolverEvidence = {
  lever: 'RETIRE_LATER' | 'SAVE_MORE' | 'TRIM_SPENDING' | 'SPEND_MORE';
  status: 'SOLVED' | 'UNAVAILABLE' | 'NOT_NEEDED';
  targetSuccessPercent: number;
  baselineSuccessPercent: number;
  achievedSuccessPercent: number | null;
  iterations: number;
  detail: string;
};

export type RuleEvaluation = {
  ruleId: RecommendationRuleId;
  category: string;
  eligible: boolean;
  priority: RecommendationPriority;
  trigger: string;
  evidence: EvidenceFact[];
  unavailable: string[];
  solverEvidence?: SolverEvidence[];
};

export type CustomRecommendationEvidence = {
  ruleId: null;
  category: 'Custom';
  eligible: true;
  priority: RecommendationPriority;
  trigger: 'Advisor-created custom action.';
  evidence: EvidenceFact[];
  unavailable: string[];
};

export type RecommendationContent = {
  title: string;
  body: string;
  nextStep: string;
  owner: string;
  targetDate: string | null;
  dollarImpact: number | null;
  impactLabel: string | null;
  lsrtHelp: string | null;
  evidence: RuleEvaluation | CustomRecommendationEvidence;
  generated: boolean;
  custom: boolean;
};

export type GeneratedRecommendation = RecommendationContent & {
  ruleId: RecommendationRuleId;
  category: string;
  priority: RecommendationPriority;
  sortOrder: number;
};

export type RecommendationGeneration = {
  evaluations: RuleEvaluation[];
  proposals: GeneratedRecommendation[];
};

export type GenerationOptions = {
  /** Set false for read-only list displays; refresh performs the bounded actual reruns. */
  runSolvers?: boolean;
};

export type RecommendationSnapshot = AnalysisSnapshot;

export type RecommendationRecord = {
  id: string;
  ruleId: string | null;
  category: string;
  priority: string;
  status: RecommendationStatus;
  scenarioId: string | null;
  sourceAnalysisId: string | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  content: RecommendationContent;
  approvalStale: boolean;
  reportEligible: boolean;
};

export type RecommendationList = {
  analysisId: string;
  /** Explicit alias retained for report/narrative callers that refer to saved source lineage. */
  sourceAnalysisId: string;
  scenarioId: string;
  scenarioName: string;
  /** Current client revision used to load the source analysis. */
  revision: number;
  clientRevision: number;
  recommendations: RecommendationRecord[];
  evaluations: RuleEvaluation[];
};

export type RecommendationReportItem = {
  id: string;
  ruleId: string | null;
  category: string;
  priority: string;
  title: string;
  body: string;
  nextStep: string;
  owner: string;
  targetDate: string | null;
  dollarImpact: number | null;
  /** Human-readable label for dollarImpact; retained as an alias for report consumers. */
  impact: string | null;
  impactLabel: string | null;
  /** Included only when the report caller has opted in to LSRT help text. */
  lsrtHelp: string | null;
};

export const editableRecommendationContentSchema = z.object({
  title: z.string().trim().min(1).max(240),
  body: z.string().trim().min(1).max(8_000),
  nextStep: z.string().trim().min(1).max(1_000),
  owner: z.string().trim().min(1).max(120),
  targetDate: z.string().date().nullable().optional(),
  dollarImpact: z.number().finite().min(-1_000_000_000_000).max(1_000_000_000_000).nullable().optional(),
  impactLabel: z.string().trim().min(1).max(240).nullable().optional(),
  lsrtHelp: z.string().trim().min(1).max(1_000).nullable().optional(),
}).strict();

export type EditableRecommendationContent = z.infer<typeof editableRecommendationContentSchema>;
