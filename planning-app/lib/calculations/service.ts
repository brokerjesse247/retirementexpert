import { Prisma } from '@prisma/client';
import { db } from '../db';
import { decryptJson, encryptJson } from '../auth/crypto';
import { ApiError } from '../auth/http';
import type { IntakeData } from '../intake/schema';
import { loadAssumptions } from '../assumptions/service';
import { mapPlanningInput, type AnalysisOverrides } from './input';
import { ENGINE_VERSION, runAnalysis } from './engine';
import { snapshotHash } from './snapshot';
import type { PlanningAssumptions, PlanningInput } from './types';

export interface AnalysisSnapshot {
  input: PlanningInput;
  assumptions: PlanningAssumptions;
  results: ReturnType<typeof runAnalysis>['results'];
  warnings: string[];
  meta: { engineVersion: string; assumptionsVersion: string; inputRevision: number; seed: number; cacheKey: string; capturedAt: string };
}
export async function ownedClient(clientId: string, advisorId: string) {
  const client = await db.client.findFirst({ where: { id: clientId, advisorId } });
  if (!client) throw new ApiError(404, 'Client not found.');
  return client;
}
export function baseScenarioId(clientId: string) { return `base-${snapshotHash(clientId).slice(0, 30)}`; }
export async function loadAnalysis(clientId: string, advisorId: string, _force = false) {
  const client = await ownedClient(clientId, advisorId);
  const asOfDate = new Date().toISOString().slice(0, 10);
  const assumptions = await loadAssumptions(advisorId);
  const id = baseScenarioId(clientId);
  const scenario = await db.scenario.upsert({ where: { id }, create: { id, clientId, name: 'Base plan', isBase: true, encryptedOverrides: encryptJson({}) }, update: {} });
  if (scenario.clientId !== clientId) throw new ApiError(404, 'Scenario not found.');
  const overrides = decryptJson<AnalysisOverrides>(scenario.encryptedOverrides);
  const input = mapPlanningInput(decryptJson<IntakeData>(client.encryptedData), assumptions, asOfDate, overrides);
  const cacheKey = snapshotHash({ clientRevision: client.revision, input, assumptions, engineVersion: ENGINE_VERSION });
  const cached = await db.analysisResult.findUnique({ where: { scenarioId_cacheKey: { scenarioId: id, cacheKey } } });
  if (cached) return { id: cached.id, snapshot: decryptJson<AnalysisSnapshot>(cached.encryptedSnapshot), overrides };
  const calculated = runAnalysis(input, assumptions);
  const snapshot: AnalysisSnapshot = { input, assumptions, results: calculated.results, warnings: calculated.warnings, meta: { engineVersion: calculated.engineVersion, assumptionsVersion: assumptions.version, inputRevision: client.revision, seed: calculated.seed, cacheKey, capturedAt: new Date().toISOString() } };
  try {
    const saved = await db.$transaction(async tx => {
      const stillOwned = await tx.client.findFirst({ where: { id: clientId, advisorId, revision: client.revision }, select: { id: true } });
      if (!stillOwned) throw new ApiError(409, 'Client changed during calculation. Reload the analysis.');
      const row = await tx.analysisResult.create({ data: { scenarioId: id, cacheKey, engineVersion: ENGINE_VERSION, assumptionsYear: assumptions.year, assumptionsVersion: assumptions.version, inputRevision: client.revision, encryptedSnapshot: encryptJson(snapshot), snapshotChecksum: snapshotHash(snapshot) } });
      await tx.auditLog.create({ data: { advisorId, clientId, action: 'ANALYSIS_GENERATED', entity: 'AnalysisResult', entityId: row.id, summary: 'Saved reproducible calculation snapshot; no report was sent.' } });
      return row;
    }, { maxWait: 30_000, timeout: 120_000 });
    return { id: saved.id, snapshot, overrides };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const winner = await db.analysisResult.findUnique({ where: { scenarioId_cacheKey: { scenarioId: id, cacheKey } } });
      if (winner) return { id: winner.id, snapshot: decryptJson<AnalysisSnapshot>(winner.encryptedSnapshot), overrides };
    }
    throw error;
  }
}
export async function saveAnalysisOverrides(clientId: string, advisorId: string, overrides: AnalysisOverrides, revision: number) {
  const client = await ownedClient(clientId, advisorId);
  if (client.revision !== revision) throw new ApiError(409, 'Client changed elsewhere. Reload first.');
  const id = baseScenarioId(clientId);
  await db.scenario.upsert({ where: { id }, create: { id, clientId, name: 'Base plan', isBase: true, encryptedOverrides: encryptJson(overrides) }, update: { encryptedOverrides: encryptJson(overrides) } });
  await db.auditLog.create({ data: { advisorId, clientId, action: 'ANALYSIS_INPUTS_UPDATED', entity: 'Scenario', entityId: id, summary: 'Advisor updated optional planning inputs; previous reports are unchanged.' } });
  return loadAnalysis(clientId, advisorId);
}
