import { describe, expect, it } from 'vitest';
import { savedClientMetrics } from '../lib/services/client-metrics';
const sample = { input: { asOfDate: '2026-10-21' }, meta: { inputRevision: 4, assumptionsVersion: '2026.1', engineVersion: 'test' }, results: { netWorth: { totalInvestable: 100000 }, readiness: { score: 0 }, monteCarlo: { successPercent: .5 } } };
describe('current saved client metrics', () => {
  it('keeps valid zero scores and percentage-point units', () => { const actual = savedClientMetrics(sample, 4, '2026.1', 'test', '2026-10-21'); expect(actual.readinessScore).toBe(0); expect(actual.successPercent).toBe(.5); expect(actual.investableAssets).toBe(100000); });
  it('does not present stale inputs, assumptions, engine or dates as current values', () => { for (const args of [[5, '2026.1', 'test', '2026-10-21'], [4, '2026.2', 'test', '2026-10-21'], [4, '2026.1', 'changed', '2026-10-21'], [4, '2026.1', 'test', '2026-10-22']] as const) { const actual = savedClientMetrics(sample, args[0], args[1], args[2], args[3]); expect(actual.analysisStale).toBe(true); expect(actual.successPercent).toBeNull(); } });
  it('keeps missing records and invalid values unavailable', () => { expect(savedClientMetrics(null, 4, '2026.1', 'test').readinessScore).toBeNull(); const actual = savedClientMetrics({ ...sample, results: { monteCarlo: { successPercent: NaN } } }, 4, '2026.1', 'test', '2026-10-21'); expect(actual.readinessScore).toBeNull(); expect(actual.successPercent).toBeNull(); });
});
