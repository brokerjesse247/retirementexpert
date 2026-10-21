import { z } from 'zod';

export const NARRATIVE_SECTION_IDS = [
  'executive-summary',
  'net-worth',
  'social-security',
  'retirement-income',
  'monte-carlo',
  'withdrawal-strategy',
  'tax-plan',
  'rmds',
  'healthcare-medicare',
  'long-term-care',
  'investments',
  'protection-estate',
  'action-plan',
] as const;

export type NarrativeSectionId = (typeof NARRATIVE_SECTION_IDS)[number];
export type NarrativeMode = 'TEMPLATE' | 'OPTIONAL_AI' | 'EDITED';

export const narrativeModeSchema = z.enum(['TEMPLATE', 'OPTIONAL_AI', 'EDITED']);
export const narrativeSectionsSchema = z.record(z.string().trim().min(1).max(2_000));
export const narrativeContentSchema = z.object({
  letter: z.string().trim().min(1).max(5_000),
  sections: narrativeSectionsSchema,
  mode: narrativeModeSchema.default('TEMPLATE'),
}).strict();

export type NarrativeContent = z.infer<typeof narrativeContentSchema>;

export type ApprovedRecommendationFact = {
  id: string;
  title: string;
  body: string;
  nextStep: string | null;
  owner: string | null;
  targetDate: string | null;
  dollarImpact: string | null;
  impactLabel: string | null;
};

export type NarrativeFact = {
  id: string;
  label: string;
  value: string;
  sourcePath: string;
};

export type NarrativeTemplateContext = {
  firstName: string;
  concerns: string[];
  scenarioName: string;
  results: Record<string, unknown>;
  approvedRecommendations: ApprovedRecommendationFact[];
};

export type NarrativeValidationContext = {
  results: unknown;
  analysisMeta?: unknown;
  approvedRecommendations: ApprovedRecommendationFact[];
};

export type NarrativeValidation = { valid: true; content: NarrativeContent } | {
  valid: false;
  errors: string[];
  unsupportedNumbers: string[];
};

export type NarrativeState = {
  id: string;
  scenarioId: string;
  sourceAnalysisId: string;
  letter: string;
  sections: Record<string, string>;
  mode: NarrativeMode;
  approvedAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  stale: boolean;
};
