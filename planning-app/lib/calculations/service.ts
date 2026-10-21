import { Prisma } from '@prisma/client';
import { db } from '../db';
import { decryptJson, encryptJson } from '../auth/crypto';
import { ApiError } from '../auth/http';
import type { IntakeData } from '../intake/schema';
import { loadAssumptions } from '../assumptions/service';
import { analysisOverridesSchema, mapPlanningInput, type AnalysisOverrides } from './input';
import { ENGINE_VERSION, runAnalysis } from './engine';
import { snapshotHash } from './snapshot';
import type { AnalysisRunOptions, PlanningAssumptions, PlanningInput } from './types';

export interface AnalysisScenarioMeta {
  id: string;
  name: string;
  revision: number;
  /** Included for duplicate lineage without adding a new Prisma column. */
  sourceLineage?: { sourceScenarioId: string; sourceScenarioRevision: number } | null;
}
export interface AnalysisSnapshot {
  input: PlanningInput;
  assumptions: PlanningAssumptions;
  results: ReturnType<typeof runAnalysis>['results'];
  warnings: string[];
  meta: {
    engineVersion: string;
    assumptionsVersion: string;
    inputRevision: number;
    seed: number;
    cacheKey: string;
    capturedAt: string;
    /** Effective saved scenario identity, revision, and non-sensitive execution options. */
    scenario: AnalysisScenarioMeta & { options: AnalysisRunOptions };
  };
}
export interface PersistedAnalysis {
  id: string;
  snapshot: AnalysisSnapshot;
}
export interface PersistAnalysisArgs {
  clientId: string;
  advisorId: string;
  scenario: AnalysisScenarioMeta;
  input: PlanningInput;
  assumptions: PlanningAssumptions;
  /** Returned for the backwards-compatible analysis API response; not used as input to calculation. */
  overrides: unknown;
  engineOptions?: AnalysisRunOptions;
}

export async function ownedClient(clientId: string, advisorId: string) {
  const client = await db.client.findFirst({ where: { id: clientId, advisorId } });
  if (!client) throw new ApiError(404, 'Client not found.');
  return client;
}
export function baseScenarioId(clientId: string) { return `base-${snapshotHash(clientId).slice(0, 30)}`; }

/**
 * Computes a complete snapshot before opening its short persistence transaction.
 * The unique scenario/cache index still resolves simultaneous identical requests.
 */
export async function persistAnalysisSnapshot(args: PersistAnalysisArgs): Promise<PersistedAnalysis> {
  const client = await ownedClient(args.clientId, args.advisorId);
  const engineOptions = args.engineOptions ?? {};
  const cacheKey = snapshotHash({
    clientRevision: client.revision,
    scenario: args.scenario,
    input: args.input,
    assumptions: args.assumptions,
    engineVersion: ENGINE_VERSION,
    engineOptions,
  });
  const cached = await db.analysisResult.findUnique({ where: { scenarioId_cacheKey: { scenarioId: args.scenario.id, cacheKey } } });
  if (cached) return { id: cached.id, snapshot: decryptJson<AnalysisSnapshot>(cached.encryptedSnapshot) };

  // Deliberately outside a database transaction: Monte Carlo and every pure engine run here.
  const calculated = runAnalysis(args.input, args.assumptions, engineOptions);
  const snapshot: AnalysisSnapshot = {
    input: args.input,
    assumptions: args.assumptions,
    results: calculated.results,
    warnings: calculated.warnings,
    meta: {
      engineVersion: calculated.engineVersion,
      assumptionsVersion: args.assumptions.version,
      inputRevision: client.revision,
      seed: calculated.seed,
      cacheKey,
      capturedAt: new Date().toISOString(),
      scenario: { ...args.scenario, options: engineOptions },
    },
  };
  try {
    const saved = await db.$transaction(async (tx) => {
      const stillOwned = await tx.client.findFirst({ where: { id: args.clientId, advisorId: args.advisorId, revision: client.revision }, select: { id: true } });
      if (!stillOwned) throw new ApiError(409, 'Client changed during calculation. Reload the analysis.');
      const stillScenario = await tx.scenario.findFirst({ where: { id: args.scenario.id, clientId: args.clientId, revision: args.scenario.revision }, select: { id: true } });
      if (!stillScenario) throw new ApiError(409, 'Scenario changed during calculation. Reload the scenario before comparing it.');
      const row = await tx.analysisResult.create({
        data: {
          scenarioId: args.scenario.id,
          cacheKey,
          engineVersion: ENGINE_VERSION,
          assumptionsYear: args.assumptions.year,
          assumptionsVersion: args.assumptions.version,
          inputRevision: client.revision,
          encryptedSnapshot: encryptJson(snapshot),
          snapshotChecksum: snapshotHash(snapshot),
        },
      });
      await tx.auditLog.create({ data: { advisorId: args.advisorId, clientId: args.clientId, action: 'ANALYSIS_GENERATED', entity: 'AnalysisResult', entityId: row.id, summary: 'Saved reproducible calculation snapshot; no report was sent.' } });
      return row;
    }, { maxWait: 30_000, timeout: 120_000 });
    return { id: saved.id, snapshot };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const winner = await db.analysisResult.findUnique({ where: { scenarioId_cacheKey: { scenarioId: args.scenario.id, cacheKey } } });
      if (winner) return { id: winner.id, snapshot: decryptJson<AnalysisSnapshot>(winner.encryptedSnapshot) };
    }
    throw error;
  }
}

async function baseScenario(clientId: string) {
  const id = baseScenarioId(clientId);
  return db.scenario.upsert({
    where: { id },
    create: { id, clientId, name: 'Base plan', isBase: true, encryptedOverrides: encryptJson({}), revision: 1 },
    update: {},
  });
}

/** Existing Base-plan loader remains backward compatible and never reads alternate scenarios. */
export async function loadAnalysis(clientId: string, advisorId: string, _force = false) {
  void _force;
  const client = await ownedClient(clientId, advisorId);
  const asOfDate = new Date().toISOString().slice(0, 10);
  const assumptions = await loadAssumptions(advisorId);
  const scenario = await baseScenario(clientId);
  if (scenario.clientId !== clientId) throw new ApiError(404, 'Scenario not found.');
  const raw = decryptJson<unknown>(scenario.encryptedOverrides);
  const parsed = analysisOverridesSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(409, 'Base analysis settings are no longer valid. Review and save them again.');
  const overrides = parsed.data;
  const input = mapPlanningInput(decryptJson<IntakeData>(client.encryptedData), assumptions, asOfDate, overrides);
  const persisted = await persistAnalysisSnapshot({
    clientId,
    advisorId,
    scenario: { id: scenario.id, name: 'Base plan', revision: scenario.revision },
    input,
    assumptions,
    overrides,
  });
  return { ...persisted, overrides };
}

export async function saveAnalysisOverrides(clientId: string, advisorId: string, overrides: AnalysisOverrides, revision: number) {
  const client = await ownedClient(clientId, advisorId);
  if (client.revision !== revision) throw new ApiError(409, 'Client changed elsewhere. Reload first.');
  const id = baseScenarioId(clientId);
  await db.scenario.upsert({
    where: { id },
    create: { id, clientId, name: 'Base plan', isBase: true, encryptedOverrides: encryptJson(overrides), revision: 1 },
    update: { encryptedOverrides: encryptJson(overrides), revision: { increment: 1 } },
  });
  await db.auditLog.create({ data: { advisorId, clientId, action: 'ANALYSIS_INPUTS_UPDATED', entity: 'Scenario', entityId: id, summary: 'Advisor updated optional planning inputs; previous reports are unchanged.' } });
  return loadAnalysis(clientId, advisorId);
}
