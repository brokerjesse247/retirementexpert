import type { ReportRenderInput } from '@/lib/calculations/types';
export type ScenarioReportMetric = { id: string; name: string; successPercent: number | null; lifetimeTax: number | null; medianLegacy: number | null; retirementIncomeAnnual: number | null; warnings?: string[] };
export type AdvisorReportInput = ReportRenderInput & {
  showLsrtHelp?: boolean;
  approvedNarrative?: { letter: string; sections: Record<string, string> } | null;
  scenarioComparison?: ScenarioReportMetric[];
  approvedRecommendations: Array<ReportRenderInput['approvedRecommendations'][number] & { nextStep?: string; dollarImpact?: number | null; impactLabel?: string | null; lsrtHelp?: string | null }>;
};
