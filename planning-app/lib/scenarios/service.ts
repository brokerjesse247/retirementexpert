import { db } from '../db';
import { z } from 'zod';
import { decryptJson, encryptJson } from '../auth/crypto';
import { ApiError } from '../auth/http';
import { loadAssumptions } from '../assumptions/service';
import { mapScenarioPlanningInput, scenarioOverridesSchema, type ScenarioOverrides } from '../calculations/input';
import { baseScenarioId, loadAnalysis, ownedClient, persistAnalysisSnapshot } from '../calculations/service';
import type { IntakeData } from '../intake/schema';

export interface ScenarioLineage {
  sourceScenarioId: string;
  sourceScenarioRevision: number;
}
export interface ScenarioPayload {
  version: 1;
  overrides: ScenarioOverrides;
  lineage?: ScenarioLineage;
}
export interface ScenarioSummary {
  id: string;
  name: string;
  isBase: boolean;
  status: 'DRAFT' | 'ARCHIVED';
  revision: number;
  createdAt: string;
  updatedAt: string;
  overrides: ScenarioOverrides;
  lineage: ScenarioLineage | null;
}
export interface ScenarioMetric {
  value: number | null;
  unit: 'PERCENT' | 'USD' | 'USD_PER_YEAR';
  availability: 'AVAILABLE' | 'UNAVAILABLE';
  note?: string;
}
export interface ScenarioComparisonRow {
  scenarioId: string;
  scenarioName: string;
  name: string;
  analysisId: string;
  metrics: {
    successPercent: ScenarioMetric;
    lifetimeTax: ScenarioMetric;
    medianLegacy: ScenarioMetric;
    retirementIncome: ScenarioMetric;
  };
}
export interface ScenarioComparison {
  scenarios: ScenarioComparisonRow[];
  limit: 3;
}

const envelopedPayloadSchema = z.object({
  version: z.literal(1),
  overrides: scenarioOverridesSchema,
  lineage: z.object({
    sourceScenarioId: z.string().min(1).max(191),
    sourceScenarioRevision: z.number().int().min(1),
  }).strict().optional(),
}).strict();

/** Decodes current envelopes and accepts a pre-envelope strict scenario shape for safe migration. */
export function parseScenarioPayload(value: unknown): ScenarioPayload {
  const enveloped = envelopedPayloadSchema.safeParse(value);
  if (enveloped.success) return enveloped.data;
  const legacy = scenarioOverridesSchema.safeParse(value);
  if (legacy.success) return { version: 1, overrides: legacy.data };
  throw new ApiError(409, 'Scenario overrides are no longer valid. Review and save the scenario again.');
}
export function serializeScenarioPayload(overrides: ScenarioOverrides, lineage?: ScenarioLineage): ScenarioPayload {
  return lineage ? { version: 1, overrides, lineage } : { version: 1, overrides };
}
function storedPayload(row: { encryptedOverrides: string; isBase: boolean }): ScenarioPayload {
  const raw = decryptJson<unknown>(row.encryptedOverrides);
  if (row.isBase) {
    // Base has a distinct, backward-compatible flat override contract and never inherits alternate inputs.
    return { version: 1, overrides: {} };
  }
  return parseScenarioPayload(raw);
}
function summary(row: { id: string; name: string; isBase: boolean; status: 'DRAFT' | 'ARCHIVED'; revision: number; createdAt: Date; updatedAt: Date; encryptedOverrides: string }): ScenarioSummary {
  const payload = storedPayload(row);
  return {
    id: row.id,
    name: row.name,
    isBase: row.isBase,
    status: row.status,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    overrides: payload.overrides,
    lineage: payload.lineage ?? null,
  };
}
function normalizedName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 180) throw new ApiError(422, 'Scenario name must be between 1 and 180 characters.');
  return name;
}
async function ensureBaseScenario(clientId: string) {
  const id = baseScenarioId(clientId);
  return db.scenario.upsert({
    where: { id },
    create: { id, clientId, name: 'Base plan', isBase: true, encryptedOverrides: encryptJson({}), revision: 1 },
    update: {},
  });
}
async function findOwnedScenario(clientId: string, advisorId: string, scenarioId: string, options: { editable?: boolean; active?: boolean } = {}) {
  await ownedClient(clientId, advisorId);
  const row = await db.scenario.findFirst({ where: { id: scenarioId, clientId } });
  if (!row) throw new ApiError(404, 'Scenario not found.');
  if (options.editable && row.isBase) throw new ApiError(422, 'The Base plan is not an alternate scenario. Use its existing analysis settings instead.');
  if (options.editable && row.status !== 'DRAFT') throw new ApiError(409, 'Archived scenarios cannot be edited. Duplicate one to continue planning.');
  if (options.active && row.status !== 'DRAFT') throw new ApiError(409, 'Archived scenarios cannot be recalculated or compared. Duplicate one to continue planning.');
  return row;
}
async function revisedScenario(
  clientId: string,
  advisorId: string,
  scenarioId: string,
  revision: number,
  data: { name?: string; status?: 'ARCHIVED'; payload?: ScenarioPayload },
) {
  if (!Number.isInteger(revision) || revision < 1) throw new ApiError(422, 'A current scenario revision is required.');
  const current = await findOwnedScenario(clientId, advisorId, scenarioId, { editable: true });
  if (current.revision !== revision) throw new ApiError(409, 'Scenario changed elsewhere. Reload it before saving.');
  const result = await db.scenario.updateMany({
    where: { id: scenarioId, clientId, revision },
    data: {
      ...(data.name === undefined ? {} : { name: normalizedName(data.name) }),
      ...(data.status === undefined ? {} : { status: data.status }),
      ...(data.payload === undefined ? {} : { encryptedOverrides: encryptJson(data.payload) }),
      revision: { increment: 1 },
    },
  });
  if (result.count !== 1) throw new ApiError(409, 'Scenario changed elsewhere. Reload it before saving.');
  const updated = await db.scenario.findFirst({ where: { id: scenarioId, clientId } });
  if (!updated) throw new ApiError(404, 'Scenario not found.');
  return updated;
}

export async function listScenarios(clientId: string, advisorId: string): Promise<ScenarioSummary[]> {
  await ownedClient(clientId, advisorId);
  await ensureBaseScenario(clientId);
  const rows = await db.scenario.findMany({ where: { clientId }, orderBy: [{ isBase: 'desc' }, { updatedAt: 'desc' }] });
  return rows.map(summary);
}

export async function createScenario(clientId: string, advisorId: string, name: string, overrides: ScenarioOverrides): Promise<ScenarioSummary> {
  await ownedClient(clientId, advisorId);
  const row = await db.scenario.create({
    data: { clientId, name: normalizedName(name), encryptedOverrides: encryptJson(serializeScenarioPayload(overrides)), isBase: false, status: 'DRAFT', revision: 1 },
  });
  await db.auditLog.create({ data: { advisorId, clientId, action: 'SCENARIO_CREATED', entity: 'Scenario', entityId: row.id, summary: 'Advisor saved an alternate planning scenario.' } });
  return summary(row);
}

export async function updateScenario(clientId: string, advisorId: string, scenarioId: string, revision: number, patch: { name?: string; overrides?: ScenarioOverrides }): Promise<ScenarioSummary> {
  if (patch.name === undefined && patch.overrides === undefined) throw new ApiError(422, 'Provide a scenario name or supported scenario overrides.');
  const existing = await findOwnedScenario(clientId, advisorId, scenarioId, { editable: true });
  const currentPayload = storedPayload(existing);
  const row = await revisedScenario(clientId, advisorId, scenarioId, revision, {
    name: patch.name,
    payload: patch.overrides === undefined ? undefined : serializeScenarioPayload(patch.overrides, currentPayload.lineage),
  });
  await db.auditLog.create({ data: { advisorId, clientId, action: 'SCENARIO_UPDATED', entity: 'Scenario', entityId: scenarioId, summary: 'Advisor updated an alternate planning scenario.' } });
  return summary(row);
}

export async function duplicateScenario(clientId: string, advisorId: string, scenarioId: string, name?: string): Promise<ScenarioSummary> {
  const source = await findOwnedScenario(clientId, advisorId, scenarioId);
  const sourcePayload = storedPayload(source);
  const derivedName = name === undefined ? `Copy of ${source.name}`.slice(0, 180) : name;
  const row = await db.scenario.create({
    data: {
      clientId,
      name: normalizedName(derivedName),
      encryptedOverrides: encryptJson(serializeScenarioPayload(structuredClone(sourcePayload.overrides), { sourceScenarioId: source.id, sourceScenarioRevision: source.revision })),
      isBase: false,
      status: 'DRAFT',
      revision: 1,
    },
  });
  await db.auditLog.create({ data: { advisorId, clientId, action: 'SCENARIO_DUPLICATED', entity: 'Scenario', entityId: row.id, summary: 'Advisor duplicated a planning scenario with source lineage.' } });
  return summary(row);
}

export async function archiveScenario(clientId: string, advisorId: string, scenarioId: string, revision: number): Promise<ScenarioSummary> {
  const row = await revisedScenario(clientId, advisorId, scenarioId, revision, { status: 'ARCHIVED' });
  await db.auditLog.create({ data: { advisorId, clientId, action: 'SCENARIO_ARCHIVED', entity: 'Scenario', entityId: scenarioId, summary: 'Advisor archived an alternate planning scenario.' } });
  return summary(row);
}

export async function resetScenario(clientId: string, advisorId: string, scenarioId: string, revision: number): Promise<ScenarioSummary> {
  const source = await findOwnedScenario(clientId, advisorId, scenarioId, { editable: true });
  const payload = storedPayload(source);
  const row = await revisedScenario(clientId, advisorId, scenarioId, revision, { payload: serializeScenarioPayload({}, payload.lineage) });
  await db.auditLog.create({ data: { advisorId, clientId, action: 'SCENARIO_RESET', entity: 'Scenario', entityId: scenarioId, summary: 'Advisor reset an alternate planning scenario to no overrides.' } });
  return summary(row);
}

/**
 * Loads a saved alternate analysis through the same pure `runAnalysis` and snapshot
 * persistence path as Base. Omitting `scenarioId` intentionally selects Base only.
 */
export async function loadScenarioAnalysis(clientId: string, advisorId: string, scenarioId?: string) {
  if (!scenarioId) {
    const base = await loadAnalysis(clientId, advisorId);
    return { ...base, scenarioId: baseScenarioId(clientId), scenarioName: 'Base plan', name: 'Base plan' };
  }
  const scenario = await findOwnedScenario(clientId, advisorId, scenarioId, { active: true });
  if (scenario.isBase) {
    const base = await loadAnalysis(clientId, advisorId);
    return { ...base, scenarioId: scenario.id, scenarioName: 'Base plan', name: 'Base plan' };
  }
  const payload = storedPayload(scenario);
  const client = await ownedClient(clientId, advisorId);
  const assumptions = await loadAssumptions(advisorId);
  const asOfDate = new Date().toISOString().slice(0, 10);
  const effective = mapScenarioPlanningInput(decryptJson<IntakeData>(client.encryptedData), assumptions, asOfDate, payload.overrides);
  const persisted = await persistAnalysisSnapshot({
    clientId,
    advisorId,
    scenario: { id: scenario.id, name: scenario.name, revision: scenario.revision, sourceLineage: payload.lineage ?? null },
    input: effective.input,
    assumptions: effective.assumptions,
    overrides: payload.overrides,
    engineOptions: effective.engineOptions,
  });
  return { ...persisted, overrides: payload.overrides, scenarioId: scenario.id, scenarioName: scenario.name, name: scenario.name };
}

function valueAt(value: unknown, path: string): unknown {
  let current = value;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
function finiteMetric(value: unknown, unit: ScenarioMetric['unit'], note?: string): ScenarioMetric {
  return typeof value === 'number' && Number.isFinite(value)
    ? { value, unit, availability: 'AVAILABLE', ...(note ? { note } : {}) }
    : { value: null, unit, availability: 'UNAVAILABLE', ...(note ? { note } : {}) };
}
function analysisMetrics(analysis: Awaited<ReturnType<typeof loadScenarioAnalysis>>): ScenarioComparisonRow {
  const results = analysis.snapshot.results as unknown;
  const cashFlow = valueAt(results, 'cashFlow');
  const retirementYear = valueAt(cashFlow, 'retirementYear');
  const rows = valueAt(cashFlow, 'rows');
  const retirementRow = Array.isArray(rows) ? rows.find((row) => valueAt(row, 'year') === retirementYear) : undefined;
  const retirementIncome = ['socialSecurity', 'pension', 'annuity', 'otherIncome']
    .map((key) => valueAt(retirementRow, key))
    .every((value) => typeof value === 'number' && Number.isFinite(value))
    ? (['socialSecurity', 'pension', 'annuity', 'otherIncome'] as const).reduce((total, key) => total + Number(valueAt(retirementRow, key)), 0)
    : null;
  return {
    scenarioId: analysis.scenarioId,
    scenarioName: analysis.scenarioName,
    name: analysis.name,
    analysisId: analysis.id,
    metrics: {
      successPercent: finiteMetric(valueAt(results, 'monteCarlo.successPercent'), 'PERCENT', 'Percent of seeded Monte Carlo paths without an unpaid withdrawal.'),
      lifetimeTax: finiteMetric(valueAt(cashFlow, 'lifetimeFederalTax'), 'USD', 'Projected lifetime federal income tax; state tax is separately modeled where supplied.'),
      medianLegacy: finiteMetric(valueAt(results, 'monteCarlo.medianEnding'), 'USD', 'Median ending portfolio value across seeded Monte Carlo paths.'),
      retirementIncome: finiteMetric(retirementIncome, 'USD_PER_YEAR', 'Annual non-portfolio income in the modeled retirement year.'),
    },
  };
}

/** Runs and returns no more than three owned, active scenarios in caller-selected order. */
export async function scenarioComparison(clientId: string, advisorId: string, ids: string[]): Promise<ScenarioComparison> {
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 3) throw new ApiError(422, 'Choose one to three scenarios to compare.');
  if (new Set(ids).size !== ids.length) throw new ApiError(422, 'Choose each scenario only once.');
  const analyses = await Promise.all(ids.map((id) => loadScenarioAnalysis(clientId, advisorId, id)));
  return { scenarios: analyses.map(analysisMetrics), limit: 3 };
}
