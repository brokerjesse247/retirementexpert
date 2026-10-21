import { Prisma } from '@prisma/client';
import { decryptJson, encryptJson } from '@/lib/auth/crypto';
import { ApiError } from '@/lib/auth/http';
import { db } from '@/lib/db';
import { baseScenarioId, loadAnalysis, ownedClient, type AnalysisSnapshot } from '@/lib/calculations/service';
import { narrativeConcerns, narrativeFacts } from './facts';
import { generateOptionalAiNarrative } from './optional-ai';
import { generateFallbackNarrative, validatedTemplateNarrative } from './templates';
import { narrativeContentSchema, type ApprovedRecommendationFact, type NarrativeContent, type NarrativeMode, type NarrativeState } from './types';
import { unsafeNarrativeClaims, validateNarrativeContent } from './validation';

export type NarrativeAnalysis = {
  client: Awaited<ReturnType<typeof ownedClient>>;
  analysisId: string;
  scenarioId: string;
  scenarioName: string;
  snapshot: AnalysisSnapshot;
};

type StoredNarrativeRow = {
  id: string; clientId: string; scenarioId: string; sourceAnalysisId: string; encryptedContent: string;
  approvedAt: Date | null; revision: number; createdAt: Date; updatedAt: Date;
};

function scenarioKey(clientId: string, scenarioId?: string | null): string { return scenarioId || baseScenarioId(clientId); }
function safeText(value: unknown, limit = 1_000): string { return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) : ''; }
function nullableText(value: unknown, limit = 1_000): string | null { const text = safeText(value, limit); return text || null; }

function narrativeFromRow(row: StoredNarrativeRow, content: NarrativeContent, stale: boolean): NarrativeState {
  return {
    id: row.id, scenarioId: row.scenarioId, sourceAnalysisId: row.sourceAnalysisId,
    letter: content.letter, sections: content.sections, mode: content.mode,
    approvedAt: stale ? null : row.approvedAt?.toISOString() ?? null, revision: row.revision,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), stale,
  };
}

function contentFromRow(row: Pick<StoredNarrativeRow, 'encryptedContent'>): NarrativeContent {
  const parsed = narrativeContentSchema.safeParse(decryptJson<unknown>(row.encryptedContent));
  if (!parsed.success) throw new ApiError(409, 'The saved narrative is no longer valid. Generate a new template before approval.');
  return parsed.data;
}

/**
 * Base analyses are current/cached through the shared service. A named scenario
 * must already have a matching saved immutable result; this route does not run
 * a simulation or silently fall back to Base.
 */
export async function loadNarrativeAnalysis(clientId: string, advisorId: string, selectedScenarioId?: string | null): Promise<NarrativeAnalysis> {
  const client = await ownedClient(clientId, advisorId);
  const key = scenarioKey(clientId, selectedScenarioId);
  if (key === baseScenarioId(clientId)) {
    const analysis = await loadAnalysis(clientId, advisorId);
    return { client, analysisId: analysis.id, scenarioId: key, scenarioName: 'Base plan', snapshot: analysis.snapshot };
  }
  const scenario = await db.scenario.findFirst({ where: { id: key, clientId }, select: { id: true, name: true } });
  if (!scenario) throw new ApiError(404, 'Scenario not found.');
  const saved = await db.analysisResult.findFirst({ where: { scenarioId: key }, orderBy: { createdAt: 'desc' }, select: { id: true, inputRevision: true, encryptedSnapshot: true } });
  if (!saved) throw new ApiError(409, 'Generate this scenario analysis before writing a narrative.');
  if (saved.inputRevision !== client.revision) throw new ApiError(409, 'This scenario analysis is stale. Refresh the scenario calculation before writing a narrative.');
  const snapshot = decryptJson<AnalysisSnapshot>(saved.encryptedSnapshot);
  return { client, analysisId: saved.id, scenarioId: key, scenarioName: scenario.name, snapshot };
}

function recommendationContent(value: string): Record<string, unknown> {
  const decrypted = decryptJson<unknown>(value);
  return decrypted && typeof decrypted === 'object' && !Array.isArray(decrypted) ? decrypted as Record<string, unknown> : {};
}

/** Only matching, explicitly approved actions can influence a narrative. */
export async function approvedRecommendationFacts(clientId: string, analysisId: string, scenarioId: string): Promise<ApprovedRecommendationFact[]> {
  const base = scenarioId === baseScenarioId(clientId);
  const rows = await db.recommendation.findMany({
    where: {
      clientId, status: 'APPROVED', sourceAnalysisId: analysisId,
      ...(base ? { OR: [{ scenarioId }, { scenarioId: null }] } : { scenarioId }),
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, encryptedContent: true },
  });
  return rows.map((row) => {
    const content = recommendationContent(row.encryptedContent);
    return {
      id: row.id,
      title: safeText(content.title, 220) || 'Approved planning item',
      body: safeText(content.body, 1_500), nextStep: nullableText(content.nextStep, 600), owner: nullableText(content.owner, 160),
      targetDate: nullableText(content.targetDate, 64), dollarImpact: nullableText(content.dollarImpact, 200), impactLabel: nullableText(content.impactLabel, 200),
    };
  });
}

function validationContext(analysis: NarrativeAnalysis, recommendations: ApprovedRecommendationFact[]) {
  return { results: analysis.snapshot.results, analysisMeta: analysis.snapshot.meta, approvedRecommendations: recommendations };
}

function templateContext(analysis: NarrativeAnalysis, recommendations: ApprovedRecommendationFact[]) {
  const rawIntake = decryptJson<unknown>(analysis.client.encryptedData);
  const concerns = rawIntake && typeof rawIntake === 'object' && !Array.isArray(rawIntake)
    ? narrativeConcerns((rawIntake as Record<string, unknown>).rankedConcerns) : [];
  return { firstName: analysis.client.firstName, concerns, scenarioName: analysis.scenarioName, results: analysis.snapshot.results as unknown as Record<string, unknown>, approvedRecommendations: recommendations };
}

function assertExpectedAnalysis(analysis: NarrativeAnalysis, analysisId: string): void {
  if (!analysisId || analysis.analysisId !== analysisId) throw new ApiError(409, 'The analysis changed. Reload the narrative before continuing.');
}

function assertExpectedRevision(row: StoredNarrativeRow | null, revision: number): void {
  if (!Number.isInteger(revision) || revision < 0) throw new ApiError(422, 'A current narrative revision is required.');
  if ((row?.revision ?? 0) !== revision) throw new ApiError(409, 'This narrative changed elsewhere. Reload before saving.');
}

async function existingNarrative(clientId: string, scenarioId: string): Promise<StoredNarrativeRow | null> {
  return db.advisorNarrative.findUnique({ where: { clientId_scenarioId: { clientId, scenarioId } } }) as Promise<StoredNarrativeRow | null>;
}

async function saveDraftRow(args: { clientId: string; advisorId: string; analysis: NarrativeAnalysis; existing: StoredNarrativeRow | null; revision: number; content: NarrativeContent; action: string; summary: string }) {
  const { clientId, advisorId, analysis, existing, revision, content, action, summary } = args;
  assertExpectedRevision(existing, revision);
  const encryptedContent = encryptJson(content);
  try {
    return await db.$transaction(async (tx) => {
      let row: StoredNarrativeRow;
      if (existing) {
        const updated = await tx.advisorNarrative.updateMany({ where: { id: existing.id, clientId, scenarioId: analysis.scenarioId, revision }, data: { sourceAnalysisId: analysis.analysisId, encryptedContent, approvedAt: null, revision: { increment: 1 } } });
        if (!updated.count) throw new ApiError(409, 'This narrative changed elsewhere. Reload before saving.');
        row = await tx.advisorNarrative.findUniqueOrThrow({ where: { id: existing.id } }) as StoredNarrativeRow;
      } else {
        row = await tx.advisorNarrative.create({ data: { clientId, scenarioId: analysis.scenarioId, sourceAnalysisId: analysis.analysisId, encryptedContent } }) as StoredNarrativeRow;
      }
      await tx.auditLog.create({ data: { advisorId, clientId, action, entity: 'AdvisorNarrative', entityId: row.id, summary } });
      return row;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ApiError(409, 'A narrative was created elsewhere. Reload before saving.');
    throw error;
  }
}

export async function getNarrative(clientId: string, advisorId: string, selectedScenarioId?: string | null) {
  const analysis = await loadNarrativeAnalysis(clientId, advisorId, selectedScenarioId);
  const row = await existingNarrative(clientId, analysis.scenarioId);
  if (!row) return { analysisId: analysis.analysisId, scenarioId: analysis.scenarioId, scenarioName: analysis.scenarioName, narrative: null, templateMode: true };
  const content = contentFromRow(row);
  const stale = row.sourceAnalysisId !== analysis.analysisId;
  return { analysisId: analysis.analysisId, scenarioId: analysis.scenarioId, scenarioName: analysis.scenarioName, narrative: narrativeFromRow(row, content, stale), templateMode: content.mode === 'TEMPLATE' };
}

export async function generateNarrative(clientId: string, advisorId: string, input: { analysisId: string; scenarioId?: string | null; revision: number; requestOptionalAi?: boolean; dataSharingApproved?: boolean }) {
  const analysis = await loadNarrativeAnalysis(clientId, advisorId, input.scenarioId);
  assertExpectedAnalysis(analysis, input.analysisId);
  const recommendations = await approvedRecommendationFacts(clientId, analysis.analysisId, analysis.scenarioId);
  const template = validatedTemplateNarrative(templateContext(analysis, recommendations), validationContext(analysis, recommendations));
  let content = template;
  let ai = { used: false, reason: 'Template mode was selected.', model: null as string | null };
  if (input.requestOptionalAi) {
    const attempted = await generateOptionalAiNarrative({ requested: true, dataSharingApproved: Boolean(input.dataSharingApproved), ...templateContext(analysis, recommendations), facts: narrativeFacts(analysis.snapshot.results as unknown as Record<string, unknown>) });
    ai = { used: attempted.used, reason: attempted.reason, model: attempted.model };
    if (attempted.content) {
      const valid = validateNarrativeContent(attempted.content, validationContext(analysis, recommendations));
      content = valid.valid ? valid.content : template;
      if (!valid.valid) ai = { used: false, reason: 'Optional-AI text included unsupported content; the validated template was used instead.', model: attempted.model };
    }
  }
  // Should a malformed snapshot make even the numeric template unsafe, use the no-number fallback rather than saving it.
  if (!validateNarrativeContent(content, validationContext(analysis, recommendations)).valid) content = generateFallbackNarrative(templateContext(analysis, recommendations));
  const existing = await existingNarrative(clientId, analysis.scenarioId);
  const row = await saveDraftRow({ clientId, advisorId, analysis, existing, revision: input.revision, content, action: 'NARRATIVE_GENERATED', summary: 'Generated narrative draft from saved calculation facts.' });
  return { analysisId: analysis.analysisId, scenarioId: analysis.scenarioId, scenarioName: analysis.scenarioName, narrative: narrativeFromRow(row, content, false), ai };
}

export async function saveNarrativeDraft(clientId: string, advisorId: string, input: { analysisId: string; scenarioId?: string | null; revision: number; letter: string; sections: Record<string, string> }) {
  const analysis = await loadNarrativeAnalysis(clientId, advisorId, input.scenarioId);
  assertExpectedAnalysis(analysis, input.analysisId);
  const existing = await existingNarrative(clientId, analysis.scenarioId);
  if (!existing) throw new ApiError(404, 'Generate a narrative before editing it.');
  if (existing.sourceAnalysisId !== analysis.analysisId) throw new ApiError(409, 'This narrative is stale. Generate a new draft from the current analysis.');
  const recommendations = await approvedRecommendationFacts(clientId, analysis.analysisId, analysis.scenarioId);
  const candidate = { letter: input.letter, sections: input.sections, mode: 'EDITED' as NarrativeMode };
  const checked = validateNarrativeContent(candidate, validationContext(analysis, recommendations));
  if (!checked.valid) throw new ApiError(422, checked.errors[0] ?? 'Narrative text is invalid.', checked.unsupportedNumbers.length ? { numbers: checked.unsupportedNumbers.join(', ') } : undefined);
  const row = await saveDraftRow({ clientId, advisorId, analysis, existing, revision: input.revision, content: checked.content, action: 'NARRATIVE_EDITED', summary: 'Advisor edited narrative draft; approval cleared.' });
  return { analysisId: analysis.analysisId, scenarioId: analysis.scenarioId, scenarioName: analysis.scenarioName, narrative: narrativeFromRow(row, checked.content, false) };
}

export async function approveNarrative(clientId: string, advisorId: string, input: { analysisId: string; scenarioId?: string | null; revision: number }) {
  const analysis = await loadNarrativeAnalysis(clientId, advisorId, input.scenarioId);
  assertExpectedAnalysis(analysis, input.analysisId);
  const row = await existingNarrative(clientId, analysis.scenarioId);
  if (!row) throw new ApiError(404, 'Narrative not found.');
  if (row.sourceAnalysisId !== analysis.analysisId) throw new ApiError(409, 'This narrative is stale. Generate a new draft from the current analysis.');
  assertExpectedRevision(row, input.revision);
  const content = contentFromRow(row);
  const recommendations = await approvedRecommendationFacts(clientId, analysis.analysisId, analysis.scenarioId);
  const checked = validateNarrativeContent(content, validationContext(analysis, recommendations));
  if (!checked.valid) throw new ApiError(422, checked.errors[0] ?? 'Narrative text cannot be approved.', checked.unsupportedNumbers.length ? { numbers: checked.unsupportedNumbers.join(', ') } : undefined);
  const now = new Date();
  const update = await db.advisorNarrative.updateMany({ where: { id: row.id, clientId, scenarioId: analysis.scenarioId, revision: input.revision }, data: { approvedAt: now, revision: { increment: 1 } } });
  if (!update.count) throw new ApiError(409, 'This narrative changed elsewhere. Reload before approving.');
  const approved = await existingNarrative(clientId, analysis.scenarioId);
  if (!approved) throw new ApiError(404, 'Narrative not found.');
  await db.auditLog.create({ data: { advisorId, clientId, action: 'NARRATIVE_APPROVED', entity: 'AdvisorNarrative', entityId: approved.id, summary: 'Advisor approved a validated narrative for the matched analysis.' } });
  return { analysisId: analysis.analysisId, scenarioId: analysis.scenarioId, scenarioName: analysis.scenarioName, narrative: narrativeFromRow(approved, checked.content, false) };
}

export async function revokeNarrativeApproval(clientId: string, advisorId: string, input: { scenarioId?: string | null; revision: number }) {
  await ownedClient(clientId, advisorId);
  const key = scenarioKey(clientId, input.scenarioId);
  const row = await existingNarrative(clientId, key);
  if (!row) throw new ApiError(404, 'Narrative not found.');
  assertExpectedRevision(row, input.revision);
  const update = await db.advisorNarrative.updateMany({ where: { id: row.id, clientId, scenarioId: key, revision: input.revision }, data: { approvedAt: null, revision: { increment: 1 } } });
  if (!update.count) throw new ApiError(409, 'This narrative changed elsewhere. Reload before revoking approval.');
  const revoked = await existingNarrative(clientId, key);
  if (!revoked) throw new ApiError(404, 'Narrative not found.');
  const content = contentFromRow(revoked);
  await db.auditLog.create({ data: { advisorId, clientId, action: 'NARRATIVE_APPROVAL_REVOKED', entity: 'AdvisorNarrative', entityId: revoked.id, summary: 'Advisor revoked narrative approval.' } });
  return { scenarioId: key, narrative: narrativeFromRow(revoked, content, false) };
}

/**
 * Report integration calls this with its selected immutable analysis. This
 * deliberately rechecks that analysis is current, correct-scenario, approved,
 * and text-valid, so a stale or unapproved narrative is never exported.
 */
export async function approvedNarrative(clientId: string, advisorId: string, analysisId: string, scenarioId?: string | null): Promise<{ letter: string; sections: Record<string, string>; sourceAnalysisId: string; scenarioId: string; approvedAt: string } | null> {
  const analysis = await loadNarrativeAnalysis(clientId, advisorId, scenarioId);
  if (analysis.analysisId !== analysisId) return null;
  const row = await existingNarrative(clientId, analysis.scenarioId);
  if (!row?.approvedAt || row.sourceAnalysisId !== analysisId) return null;
  const content = contentFromRow(row);
  const recommendations = await approvedRecommendationFacts(clientId, analysisId, analysis.scenarioId);
  const checked = validateNarrativeContent(content, validationContext(analysis, recommendations));
  if (!checked.valid) return null;
  return { letter: checked.content.letter, sections: checked.content.sections, sourceAnalysisId: analysisId, scenarioId: analysis.scenarioId, approvedAt: row.approvedAt.toISOString() };
}

const LOOKUP_TERMS: Array<[string, string[]]> = [
  ['retirement-assets', ['retirement', 'portfolio', 'assets', 'income']],
  ['income-coverage', ['income', 'essential', 'coverage']],
  ['depletion-age', ['depletion', 'last', 'running', 'money']],
  ['monte-carlo-success', ['monte', 'success', 'market', 'chance']],
  ['monte-carlo-median', ['median', 'ending', 'market']],
  ['readiness-score', ['readiness', 'score']],
  ['lifetime-federal-tax', ['tax', 'federal', 'roth']],
  ['current-federal-tax', ['tax', 'current']],
  ['healthcare-lifetime', ['health', 'healthcare', 'medicare']],
  ['ltc-cost', ['care', 'long', 'ltc']],
  ['insurance-need', ['insurance', 'protection', 'estate']],
  ['target-equity', ['investment', 'allocation', 'equity']],
];

export async function askNarrativeResults(clientId: string, advisorId: string, input: { analysisId: string; scenarioId?: string | null; query: string }) {
  const analysis = await loadNarrativeAnalysis(clientId, advisorId, input.scenarioId);
  assertExpectedAnalysis(analysis, input.analysisId);
  const query = safeText(input.query, 280).toLowerCase();
  if (query.length < 3) throw new ApiError(422, 'Ask a results question using at least three characters.');
  const facts = narrativeFacts(analysis.snapshot.results as unknown as Record<string, unknown>);
  const preferred = LOOKUP_TERMS.flatMap(([id, terms]) => terms.some((term) => query.includes(term)) ? [id] : []);
  const matches = [...facts.filter((fact) => preferred.includes(fact.id)), ...facts.filter((fact) => !preferred.includes(fact.id))].slice(0, 3);
  const answer = matches.length
    ? `Results lookup (deterministic, not AI): ${matches.map((fact) => `${fact.label}: ${fact.value}`).join('; ')}. Review the saved assumptions and disclosures with your advisor before acting.`
    : 'Results lookup (deterministic, not AI): no matching calculated fact is available in this saved analysis. Review the assumptions and data limits with your advisor.';
  return { analysisId: analysis.analysisId, scenarioId: analysis.scenarioId, answer, facts: matches.map(({ label, value, sourcePath }) => ({ label, value, sourcePath })) };
}
