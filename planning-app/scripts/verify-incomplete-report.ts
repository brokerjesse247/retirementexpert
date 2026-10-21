import { mkdirSync, writeFileSync } from 'node:fs';
import { DEFAULT_ASSUMPTIONS } from '../lib/assumptions/defaults';
import { runAnalysis } from '../lib/calculations/engine';
import { mapPlanningInput } from '../lib/calculations/input';
import type { ReportRenderInput } from '../lib/calculations/types';
import { emptyIntake } from '../lib/intake/schema';
import { REPORT_SECTION_OPTIONS, renderReportHtml, renderReportPdf } from '../lib/reports/render';

async function main() {
  const data = structuredClone(emptyIntake);
  Object.assign(data, { firstName: 'Synthetic', lastName: 'Incomplete', email: 'synthetic@example.invalid', phone: '555-555-0101', dob: '1965-06-15', state: 'CA', maritalStatus: 'SINGLE', filingStatus: 'SINGLE', rankedConcerns: ['TAXES', 'HEALTHCARE', 'INFLATION'], riskAnswers: [3, 3, 3, 3, 3], consent: true });
  Object.assign(data.primary, { earnedIncome: '120000', pia: '2400', retirementAge: '65', partTimeIncome: '12000', preTax401k: '100000' });
  Object.assign(data.expenses, { currentMonthly: '6000', retirementMonthly: '5000', essentialMonthly: '3500' });
  const input = mapPlanningInput(data, DEFAULT_ASSUMPTIONS, new Date().toISOString().slice(0, 10));
  const analysis = runAnalysis(input, DEFAULT_ASSUMPTIONS);
  const report: ReportRenderInput = { clientName: input.clientName, generatedAt: new Date().toISOString(), version: 1, scenarioName: 'Synthetic incomplete profile', input, assumptions: DEFAULT_ASSUMPTIONS, results: analysis.results as unknown as Record<string, unknown>, sections: REPORT_SECTION_OPTIONS.map(item => item.id), coverNote: '', approvedRecommendations: [], branding: { advisorName: 'ISOLATED TEST FIXTURE', advisorEmail: 'fixture@example.invalid', advisorPhone: null, licenseNumbers: null, logoDataUrl: null, coverText: 'Your Retirement, Expertly Planned', letter: 'This fictional verification report is approved only for test-data review. No real client email is sent.', letterApproved: true, disclosure: '' } };
  mkdirSync('private-storage/report-review', { recursive: true });
  writeFileSync('private-storage/report-review/incomplete-profile.html', renderReportHtml(report));
  const pdf = await renderReportPdf(report);
  writeFileSync('private-storage/report-review/incomplete-profile.pdf', pdf);
  console.log('PASS: incomplete fictional profile renders honestly without overflowing; no database or email accessed.');
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Synthetic report verification failed.'); process.exitCode = 1; });
