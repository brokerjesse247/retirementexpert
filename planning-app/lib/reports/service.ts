import { createHash } from 'node:crypto';
import { ReportBuildStatus } from '@prisma/client';
import { db } from '../db';
import { constantTimeEqual, decryptBytes, decryptJson, encryptBytes, encryptJson, signPayload } from '../auth/crypto';
import { ApiError } from '../auth/http';
import { ownedClient, type AnalysisSnapshot } from '../calculations/service';
import { snapshotHash } from '../calculations/snapshot';
import { loadScenarioAnalysis, scenarioComparison } from '../scenarios/service';
import { approvedRecommendations } from '../recommendations/service';
import type { RecommendationContent } from '../recommendations/types';
import { approvedNarrative } from '../narrative/service';
import { reportBranding } from './branding';
import { REPORT_SECTION_OPTIONS, renderReportPdf } from './render';
import type { AdvisorReportInput } from './advisor-types';
import type { ReportRenderInput } from '../calculations/types';

export interface GenerateOptions { requestKey: string; sections: string[]; coverNote: string; letter: string; letterApproved: boolean; revision: number; scenarioId?: string; comparisonIds?: string[]; showLsrtHelp?: boolean; useApprovedNarrative?: boolean }
export async function createReport(clientId: string, advisorId: string, options: GenerateOptions) {
  if (!options.letterApproved) throw new ApiError(422, 'Review and approve the advisor letter before generating a client report.');
  if (!options.sections.length || options.sections.some(s => !REPORT_SECTION_OPTIONS.some(o => o.id === s))) throw new ApiError(422, 'Choose valid report sections.');
  const client = await ownedClient(clientId, advisorId);
  if (client.revision !== options.revision) throw new ApiError(409, 'Client changed elsewhere. Reload before generating.');
  const requestKey = snapshotHash({ clientId, advisorId, key: options.requestKey });
  const prior = await db.report.findUnique({ where: { requestKey } });
  if (prior) { if (prior.clientId !== clientId) throw new ApiError(404, 'Report not found.'); return prior; }
  const analysis = await loadScenarioAnalysis(clientId, advisorId, options.scenarioId);
  const recommendations = await approvedRecommendations(clientId, advisorId, analysis.id, analysis.scenarioId, options.showLsrtHelp ?? false);
  const narrative = options.useApprovedNarrative ? await approvedNarrative(clientId, advisorId, analysis.id, analysis.scenarioId) : null;
  if (options.useApprovedNarrative && !narrative) throw new ApiError(422, 'The selected scenario has no current approved narrative. Review and approve it first, or use the editable report letter.');
  const comparison = options.comparisonIds?.length ? await scenarioComparison(clientId, advisorId, options.comparisonIds) : null;
  const branding = await reportBranding(advisorId, true, narrative?.letter ?? options.letter);
  const generatedAt = new Date();
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT id FROM Client WHERE id = ${clientId} AND advisorId = ${advisorId} FOR UPDATE`;
    const current = await tx.client.findFirst({ where: { id: clientId, advisorId, revision: options.revision } });
    if (!current) throw new ApiError(409, 'Client changed during preparation. Reload first.');
    const currentScenario = await tx.scenario.findFirst({ where: { id: analysis.scenarioId, clientId, status: 'DRAFT', revision: analysis.snapshot.meta.scenario.revision } });
    if (!currentScenario) throw new ApiError(409, 'The selected scenario changed during report preparation. Recalculate it first.');
    // Approval facts are reread under the client lock; stale/cross-scenario approvals stay excluded.
    const approvals = await tx.recommendation.findMany({ where: { id: { in: recommendations.map(r => r.id) }, clientId, scenarioId: analysis.scenarioId, sourceAnalysisId: analysis.id, status: 'APPROVED' }, select: { id: true, revision: true, encryptedContent: true } });
    const visible = recommendations.flatMap(item => {
      const row = approvals.find(r => r.id === item.id); if (!row) return [];
      const content = decryptJson<RecommendationContent>(row.encryptedContent);
      return [{ ...item, title: content.title, body: content.body, nextStep: content.nextStep, owner: content.owner, targetDate: content.targetDate, dollarImpact: content.dollarImpact, impactLabel: content.impactLabel, lsrtHelp: options.showLsrtHelp ? content.lsrtHelp : null }];
    });
    if (narrative) {
      const stillApproved = await tx.advisorNarrative.findUnique({ where: { clientId_scenarioId: { clientId, scenarioId: analysis.scenarioId } } });
      if (!stillApproved?.approvedAt || stillApproved.sourceAnalysisId !== analysis.id || stillApproved.approvedAt.toISOString() !== narrative.approvedAt) throw new ApiError(409, 'Narrative approval changed during report preparation. Review it again.');
    }
    const duplicate = await tx.report.findUnique({ where: { requestKey } }); if (duplicate) return duplicate;
    const latest = await tx.report.aggregate({ where: { clientId }, _max: { version: true } });
    const version = (latest._max.version ?? 0) + 1;
    const snapshot: AdvisorReportInput & { analysisMeta: AnalysisSnapshot['meta']; analysisChecksum: string } = {
      clientName: analysis.snapshot.input.clientName, generatedAt: generatedAt.toISOString(), version,
      input: analysis.snapshot.input, assumptions: analysis.snapshot.assumptions, results: analysis.snapshot.results as unknown as Record<string, unknown>,
      branding, sections: options.sections, coverNote: options.coverNote,
      approvedRecommendations: visible.map(r => ({ ...r, targetDate: r.targetDate ?? undefined, impactLabel: r.impactLabel ?? null, lsrtHelp: r.lsrtHelp ?? null })),
      scenarioName: analysis.scenarioName, analysisMeta: analysis.snapshot.meta, analysisChecksum: snapshotHash(analysis.snapshot),
      showLsrtHelp: options.showLsrtHelp ?? false, approvedNarrative: narrative,
      scenarioComparison: comparison?.scenarios.map(s => ({ id: s.scenarioId, name: s.scenarioName, successPercent: s.metrics.successPercent.value, lifetimeTax: s.metrics.lifetimeTax.value, medianLegacy: s.metrics.medianLegacy.value, retirementIncomeAnnual: s.metrics.retirementIncome.value, warnings: Object.values(s.metrics).flatMap(m => m.note ? [m.note] : []) })) ?? [],
    };
    const retainUntil = new Date(generatedAt); retainUntil.setUTCFullYear(retainUntil.getUTCFullYear() + 6);
    const report = await tx.report.create({ data: { clientId, analysisResultId: analysis.id, version, requestKey, status: ReportBuildStatus.QUEUED, encryptedSnapshot: encryptJson(snapshot), generatedAt, retainUntil } });
    await tx.auditLog.create({ data: { advisorId, clientId, action: 'REPORT_REQUESTED', entity: 'Report', entityId: report.id, summary: `Approved scenario/action/text snapshot version ${version} queued; no delivery requested.` } });
    return report;
  }, { timeout: 20000 });
}
export async function processReport(reportId: string): Promise<void> {
  const claimed = await db.report.updateMany({ where: { id: reportId, status: ReportBuildStatus.QUEUED }, data: { status: ReportBuildStatus.GENERATING, buildStartedAt: new Date(), errorCode: null } }); if (!claimed.count) return;
  const report = await db.report.findUnique({ where: { id: reportId }, include: { client: { select: { advisorId: true } } } }); if (!report) return;
  try {
    const snapshot = decryptJson<ReportRenderInput>(report.encryptedSnapshot);
    if (!snapshot.branding.letterApproved) throw new Error('REPORT_APPROVAL_REQUIRED');
    const pdf = await renderReportPdf(snapshot); if (pdf.length > 12 * 1024 * 1024 || pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('REPORT_FILE_INVALID');
    const checksum = createHash('sha256').update(pdf).digest('hex');
    await db.$transaction(async tx => {
      const updated = await tx.report.updateMany({ where: { id: reportId, status: ReportBuildStatus.GENERATING }, data: { status: ReportBuildStatus.READY, encryptedPdf: new Uint8Array(encryptBytes(pdf)), checksum, completedAt: new Date() } }); if (!updated.count) return;
      await tx.client.updateMany({ where: { id: report.clientId, status: { in: ['NEW', 'IN_REVIEW', 'REPORT_GENERATED'] } }, data: { status: 'REPORT_GENERATED' } });
      await tx.auditLog.create({ data: { advisorId: report.client.advisorId, clientId: report.clientId, action: 'REPORT_GENERATED', entity: 'Report', entityId: reportId, summary: `Private PDF version ${report.version} generated. No client email sent.` } });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const errorCode = message.startsWith('REPORT_LAYOUT_OVERFLOW') ? 'REPORT_LAYOUT_OVERFLOW' : message.includes('PDF rendering runtime unavailable') || message.includes('CHROMIUM_EXECUTABLE_PATH') ? 'REPORT_RUNTIME_UNAVAILABLE' : 'REPORT_BUILD_FAILED';
    await db.report.updateMany({ where: { id: reportId, status: ReportBuildStatus.GENERATING }, data: { status: ReportBuildStatus.FAILED, errorCode } });
  }
}
export async function deliverDueReports(limit = 2) {
  const cutoff = new Date(Date.now() - 10 * 60_000);
  await db.report.updateMany({ where: { status: ReportBuildStatus.GENERATING, buildStartedAt: { lte: cutoff } }, data: { status: ReportBuildStatus.FAILED, errorCode: 'REPORT_BUILD_INTERRUPTED' } });
  const rows = await db.report.findMany({ where: { status: ReportBuildStatus.QUEUED }, take: Math.max(1, Math.min(5, limit)), orderBy: { generatedAt: 'asc' }, select: { id: true } });
  for (const row of rows) await processReport(row.id);
  return { processed: rows.length };
}
export async function reportHistory(clientId: string, advisorId: string) { await ownedClient(clientId, advisorId); return db.report.findMany({ where: { clientId }, orderBy: { version: 'desc' }, select: { id: true, version: true, status: true, generatedAt: true, completedAt: true, sentAt: true, errorCode: true, checksum: true, retainUntil: true } }); }
export function privateReportLink(reportId: string, sessionId: string): string { const payload = Buffer.from(JSON.stringify({ reportId, sessionId, expires: Date.now() + 10 * 60000 })).toString('base64url'); return `/api/reports/${encodeURIComponent(reportId)}/download?grant=${encodeURIComponent(payload + '.' + signPayload(payload))}`; }
export function verifyReportGrant(grant: string, reportId: string, sessionId: string) {
  if (grant.length > 1500) throw new ApiError(403, 'Invalid private download grant.'); const [payload, signature] = grant.split('.');
  if (!payload || !signature || !constantTimeEqual(signPayload(payload), signature)) throw new ApiError(403, 'Invalid private download grant.');
  try { const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { reportId: string; sessionId: string; expires: number }; if (parsed.reportId !== reportId || parsed.sessionId !== sessionId || !Number.isFinite(parsed.expires) || parsed.expires <= Date.now()) throw new Error('invalid'); } catch { throw new ApiError(403, 'Private report link expired or is not valid for your session.'); }
}
export async function ownedReport(reportId: string, advisorId: string) { const report = await db.report.findFirst({ where: { id: reportId, client: { advisorId } }, include: { client: { select: { id: true } } } }); if (!report) throw new ApiError(404, 'Report not found.'); return report; }
export async function reportPdfBytes(reportId: string, advisorId: string) { const report = await ownedReport(reportId, advisorId); if (report.status !== ReportBuildStatus.READY || !report.encryptedPdf) throw new ApiError(409, 'Report is not ready.'); const bytes = decryptBytes(report.encryptedPdf); if (!report.checksum || !constantTimeEqual(createHash('sha256').update(bytes).digest('hex'), report.checksum)) throw new ApiError(503, 'Report integrity check failed.'); return { bytes, version: report.version, clientId: report.clientId }; }
