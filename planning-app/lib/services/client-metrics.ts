type Metrics = { investableAssets: number | null; readinessScore: number | null; successPercent: number | null; analysisStale: boolean };
const unavailable = (stale = false): Metrics => ({ investableAssets: null, readinessScore: null, successPercent: null, analysisStale: stale });
function object(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function finite(value: unknown, max = Infinity): number | null { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null; }
export function savedClientMetrics(snapshot: unknown, revision: number, assumptionsVersion: string, engineVersion: string, date = new Date().toISOString().slice(0, 10)): Metrics {
  const frame = object(snapshot); if (!frame) return unavailable();
  const meta = object(frame.meta); const input = object(frame.input); const results = object(frame.results);
  if (!meta || !input || !results) return unavailable(true);
  if (meta.inputRevision !== revision || meta.assumptionsVersion !== assumptionsVersion || meta.engineVersion !== engineVersion || input.asOfDate !== date) return unavailable(true);
  return { investableAssets: finite(object(results.netWorth)?.totalInvestable), readinessScore: finite(object(results.readiness)?.score, 100), successPercent: finite(object(results.monteCarlo)?.successPercent, 100), analysisStale: false };
}
