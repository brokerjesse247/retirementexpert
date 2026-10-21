import { RecommendationStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { decryptJson, encryptJson } from '@/lib/auth/crypto';
import { ApiError } from '@/lib/auth/http';
import { baseScenarioId, ownedClient, type AnalysisSnapshot } from '@/lib/calculations/service';
import { loadScenarioAnalysis } from '@/lib/scenarios/service';
import { generateRecommendations } from './generate';
import type {
  EditableRecommendationContent,
  RecommendationContent,
  RecommendationList,
  RecommendationRecord,
  RecommendationReportItem,
  RecommendationStatus as RecommendationStatusValue,
  RuleEvaluation,
  SupplementalFacts,
} from './types';

const CONTENT_LIMITS = { title: 240, body: 8_000, nextStep: 1_000, owner: 120, impactLabel: 240, lsrtHelp: 1_000 } as const;

type ScopedAnalysis = {
  id: string;
  snapshot: AnalysisSnapshot;
  scenarioId: string;
  scenarioName: string;
  clientRevision: number;
};

type DbRecommendation = Awaited<ReturnType<typeof db.recommendation.findFirst>>;

function isStatus(value: string): value is RecommendationStatusValue {
  return value === 'PROPOSED' || value === 'APPROVED' || value === 'EDITED' || value === 'REMOVED';
}
function validContent(value: unknown): value is RecommendationContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const content = value as Partial<RecommendationContent>;
  return typeof content.title === 'string' && typeof content.body === 'string' && typeof content.nextStep === 'string'
    && typeof content.owner === 'string' && typeof content.generated === 'boolean' && typeof content.custom === 'boolean'
    && Boolean(content.evidence) && typeof content.evidence === 'object';
}
function decryptContent(encryptedContent: string): RecommendationContent {
  const content = decryptJson<unknown>(encryptedContent);
  if (!validContent(content)) throw new ApiError(500, 'Saved recommendation content is invalid.');
  return content;
}
function toRecord(row: NonNullable<DbRecommendation>, currentAnalysisId: string): RecommendationRecord {
  const content = decryptContent(row.encryptedContent);
  const status = row.status as string;
  if (!isStatus(status)) throw new ApiError(500, 'Saved recommendation status is invalid.');
  const approvalStale = status === 'APPROVED' && row.sourceAnalysisId !== currentAnalysisId;
  return {
    id: row.id,
    ruleId: row.ruleId,
    category: row.category,
    priority: row.priority,
    status,
    scenarioId: row.scenarioId,
    sourceAnalysisId: row.sourceAnalysisId,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    content,
    approvalStale,
    reportEligible: status === 'APPROVED' && !approvalStale,
  };
}
function scopedWhere(scenarioId: string) { return { scenarioId }; }

/** Loads the Base or named scenario through the shared scenarios-unit analysis contract. */
export async function loadRecommendationAnalysis(clientId: string, advisorId: string, scenarioId?: string | null): Promise<ScopedAnalysis> {
  const client = await ownedClient(clientId, advisorId);
  const loaded = await loadScenarioAnalysis(clientId, advisorId, scenarioId ?? undefined);
  return {
    id: loaded.id,
    snapshot: loaded.snapshot as AnalysisSnapshot,
    scenarioId: loaded.scenarioId,
    scenarioName: loaded.scenarioName,
    clientRevision: client.revision,
  };
}

async function assertExpectedClientRevision(clientId: string, advisorId: string, expectedClientRevision?: number): Promise<void> {
  if (expectedClientRevision === undefined) return;
  const client = await ownedClient(clientId, advisorId);
  if (!Number.isInteger(expectedClientRevision) || client.revision !== expectedClientRevision) {
    throw new ApiError(409, 'Client data changed elsewhere. Reload the analysis before refreshing recommendations.');
  }
}

async function recordsForScope(clientId: string, scenarioId: string, currentAnalysisId: string): Promise<RecommendationRecord[]> {
  const rows = await db.recommendation.findMany({ where: { clientId, ...scopedWhere(scenarioId) }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  return rows.map((row) => toRecord(row, currentAnalysisId));
}

/** Returns saved records plus an all-25-rule, read-only current eligibility evaluation. */
export async function listRecommendations(clientId: string, advisorId: string, scenarioId?: string | null): Promise<RecommendationList> {
  const analysis = await loadRecommendationAnalysis(clientId, advisorId, scenarioId);
  const generation = generateRecommendations(analysis.snapshot, {}, { runSolvers: false });
  return {
    analysisId: analysis.id,
    sourceAnalysisId: analysis.id,
    scenarioId: analysis.scenarioId,
    scenarioName: analysis.scenarioName,
    revision: analysis.clientRevision,
    clientRevision: analysis.clientRevision,
    recommendations: await recordsForScope(clientId, analysis.scenarioId, analysis.id),
    evaluations: generation.evaluations,
  };
}

/**
 * Creates/updates only automatically generated proposed recommendations. Advisor-edited,
 * custom, removed, and approved records are deliberately preserved, so refresh cannot
 * silently renew approval or overwrite advisor language.
 */
export async function refreshRecommendations(
  clientId: string,
  advisorId: string,
  scenarioId?: string | null,
  supplementalFacts: SupplementalFacts = {},
  expectedClientRevision?: number,
): Promise<RecommendationList> {
  await assertExpectedClientRevision(clientId, advisorId, expectedClientRevision);
  const analysis = await loadRecommendationAnalysis(clientId, advisorId, scenarioId);
  if (expectedClientRevision !== undefined && analysis.clientRevision !== expectedClientRevision) {
    throw new ApiError(409, 'Client data changed during analysis. Reload before refreshing recommendations.');
  }
  const generation = generateRecommendations(analysis.snapshot, supplementalFacts, { runSolvers: true });
  const existing = await db.recommendation.findMany({ where: { clientId, ...scopedWhere(analysis.scenarioId) } });
  const existingByRule = new Map(existing.filter((row) => row.ruleId !== null).map((row) => [row.ruleId!, row]));
  const nowProposed = new Set<string>(generation.proposals.map((proposal) => proposal.ruleId));

  // Calculation happened before this transaction. No Monte Carlo or other heavy work runs inside it.
  await db.$transaction(async (tx) => {
    for (const proposal of generation.proposals) {
      const row = existingByRule.get(proposal.ruleId);
      if (!row) {
        await tx.recommendation.create({ data: {
          clientId, ruleId: proposal.ruleId, priority: proposal.priority, category: proposal.category,
          encryptedContent: encryptJson(proposal), status: RecommendationStatus.PROPOSED, sortOrder: proposal.sortOrder,
          scenarioId: analysis.scenarioId, sourceAnalysisId: analysis.id,
        } });
        continue;
      }
      const content = decryptContent(row.encryptedContent);
      if (row.status === RecommendationStatus.PROPOSED && content.generated && !content.custom) {
        await tx.recommendation.update({ where: { id: row.id }, data: {
          priority: proposal.priority, category: proposal.category, encryptedContent: encryptJson(proposal),
          sortOrder: proposal.sortOrder, sourceAnalysisId: analysis.id, revision: { increment: 1 },
        } });
      }
    }
    for (const row of existing) {
      if (row.ruleId === null || nowProposed.has(row.ruleId)) continue;
      const content = decryptContent(row.encryptedContent);
      // A no-longer-triggered automatic proposal is removed. Edited/custom/approved work remains visible and, if approved, stale.
      if (row.status === RecommendationStatus.PROPOSED && content.generated && !content.custom) {
        await tx.recommendation.update({ where: { id: row.id }, data: { status: RecommendationStatus.REMOVED, revision: { increment: 1 } } });
      }
    }
    await tx.auditLog.create({ data: { advisorId, clientId, action: 'RECOMMENDATIONS_REFRESHED', entity: 'Recommendation', entityId: analysis.scenarioId, summary: 'Refreshed rule evaluations and generated proposals; advisor edits and approvals were preserved.' } });
  }, { maxWait: 30_000, timeout: 120_000 });

  return {
    analysisId: analysis.id,
    sourceAnalysisId: analysis.id,
    scenarioId: analysis.scenarioId,
    scenarioName: analysis.scenarioName,
    revision: analysis.clientRevision,
    clientRevision: analysis.clientRevision,
    recommendations: await recordsForScope(clientId, analysis.scenarioId, analysis.id),
    evaluations: generation.evaluations,
  };
}

function mergeEditedContent(existing: RecommendationContent, edits: EditableRecommendationContent, custom: boolean): RecommendationContent {
  return {
    ...existing,
    ...edits,
    targetDate: edits.targetDate ?? null,
    dollarImpact: edits.dollarImpact ?? null,
    impactLabel: edits.impactLabel ?? null,
    lsrtHelp: edits.lsrtHelp ?? null,
    generated: false,
    custom,
  };
}

async function findOwnedRecommendation(clientId: string, advisorId: string, recommendationId: string) {
  await ownedClient(clientId, advisorId);
  const row = await db.recommendation.findFirst({ where: { id: recommendationId, clientId } });
  if (!row) throw new ApiError(404, 'Recommendation not found.');
  return row;
}

export async function updateRecommendation(args: {
  clientId: string;
  advisorId: string;
  recommendationId: string;
  revision: number;
  action: 'approve' | 'edit' | 'remove';
  content?: EditableRecommendationContent;
}): Promise<RecommendationRecord> {
  const row = await findOwnedRecommendation(args.clientId, args.advisorId, args.recommendationId);
  if (!Number.isInteger(args.revision) || args.revision !== row.revision) {
    throw new ApiError(409, 'This recommendation changed elsewhere. Reload before saving.');
  }
  if (args.action === 'edit' && !args.content) throw new ApiError(422, 'Recommendation content is required for an edit.');

  let scoped: ScopedAnalysis | null = null;
  if (args.action === 'approve' || args.action === 'edit') {
    scoped = await loadRecommendationAnalysis(args.clientId, args.advisorId, row.scenarioId);
  }
  if (args.action === 'approve' && (!scoped || row.sourceAnalysisId !== scoped.id)) {
    throw new ApiError(409, 'This proposal is stale. Refresh or edit it against the current analysis before approval.');
  }

  const existing = decryptContent(row.encryptedContent);
  const nextStatus = args.action === 'approve' ? RecommendationStatus.APPROVED : args.action === 'edit' ? RecommendationStatus.EDITED : RecommendationStatus.REMOVED;
  const nextContent = args.action === 'edit' ? mergeEditedContent(existing, args.content!, row.ruleId === null || existing.custom) : existing;
  const updated = await db.$transaction(async (tx) => {
    const claim = await tx.recommendation.updateMany({ where: { id: row.id, clientId: args.clientId, revision: args.revision }, data: {
      status: nextStatus,
      encryptedContent: encryptJson(nextContent),
      sourceAnalysisId: args.action === 'remove' ? row.sourceAnalysisId : scoped!.id,
      revision: { increment: 1 },
    } });
    if (!claim.count) throw new ApiError(409, 'This recommendation changed elsewhere. Reload before saving.');
    await tx.advisorNarrative.updateMany({ where: { clientId: args.clientId, scenarioId: row.scenarioId ?? baseScenarioId(args.clientId), approvedAt: { not: null } }, data: { approvedAt: null, revision: { increment: 1 } } });
    await tx.auditLog.create({ data: { advisorId: args.advisorId, clientId: args.clientId, action: args.action === 'approve' ? 'RECOMMENDATION_APPROVED' : args.action === 'edit' ? 'RECOMMENDATION_EDITED' : 'RECOMMENDATION_REMOVED', entity: 'Recommendation', entityId: row.id, summary: args.action === 'approve' ? 'Advisor approved recommendation against the current analysis.' : args.action === 'edit' ? 'Advisor edited recommendation; approval was cleared.' : 'Advisor removed recommendation.' } });
    return tx.recommendation.findUniqueOrThrow({ where: { id: row.id } });
  });
  return toRecord(updated, scoped?.id ?? row.sourceAnalysisId ?? '');
}

export async function createCustomRecommendation(args: {
  clientId: string;
  advisorId: string;
  scenarioId?: string | null;
  expectedClientRevision: number;
  content: EditableRecommendationContent;
}): Promise<RecommendationRecord> {
  await assertExpectedClientRevision(args.clientId, args.advisorId, args.expectedClientRevision);
  const scoped = await loadRecommendationAnalysis(args.clientId, args.advisorId, args.scenarioId);
  if (scoped.clientRevision !== args.expectedClientRevision) throw new ApiError(409, 'Client data changed during analysis. Reload before adding an action.');
  const customContent: RecommendationContent = {
    ...args.content,
    targetDate: args.content.targetDate ?? null,
    dollarImpact: args.content.dollarImpact ?? null,
    impactLabel: args.content.impactLabel ?? null,
    lsrtHelp: args.content.lsrtHelp ?? null,
    generated: false,
    custom: true,
    evidence: { ruleId: null, category: 'Custom', priority: 'LOW', eligible: true, trigger: 'Advisor-created custom action.', evidence: [], unavailable: [] },
  };
  const created = await db.$transaction(async (tx) => {
    const last = await tx.recommendation.aggregate({ where: { clientId: args.clientId, scenarioId: scoped.scenarioId }, _max: { sortOrder: true } });
    const row = await tx.recommendation.create({ data: {
      clientId: args.clientId, ruleId: null, priority: 'LOW', category: 'Custom', encryptedContent: encryptJson(customContent),
      status: RecommendationStatus.EDITED, sortOrder: (last._max.sortOrder ?? -1) + 1,
      scenarioId: scoped.scenarioId, sourceAnalysisId: scoped.id,
    } });
    await tx.auditLog.create({ data: { advisorId: args.advisorId, clientId: args.clientId, action: 'RECOMMENDATION_CUSTOM_CREATED', entity: 'Recommendation', entityId: row.id, summary: 'Advisor created a custom recommendation; explicit approval is required.' } });
    return row;
  });
  return toRecord(created, scoped.id);
}

/**
 * Report integration boundary: returns only currently approved records whose exact saved
 * analysis and scenario lineage match. Old approvals, edits, proposed, and removed content
 * cannot enter a report.
 */
export async function approvedRecommendations(
  clientId: string,
  advisorId: string,
  analysisId: string,
  scenarioId: string | null | undefined,
  showLsrtHelp: boolean,
): Promise<RecommendationReportItem[]> {
  await ownedClient(clientId, advisorId);
  const scope = scenarioId ?? baseScenarioId(clientId);
  const rows = await db.recommendation.findMany({ where: { clientId, scenarioId: scope, sourceAnalysisId: analysisId, status: RecommendationStatus.APPROVED }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  return rows.map((row) => {
    const content = decryptContent(row.encryptedContent);
    return {
      id: row.id,
      ruleId: row.ruleId,
      category: row.category,
      priority: row.priority,
      title: content.title,
      body: content.body,
      nextStep: content.nextStep,
      owner: content.owner,
      targetDate: content.targetDate,
      dollarImpact: content.dollarImpact,
      impact: content.impactLabel,
      impactLabel: content.impactLabel,
      lsrtHelp: showLsrtHelp ? content.lsrtHelp : null,
    };
  });
}

export { generateRecommendations } from './generate';
export type { RecommendationGeneration, RecommendationContent, RuleEvaluation, SupplementalFacts } from './types';
