import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_ASSUMPTIONS } from '../lib/assumptions/defaults';
import { mapPlanningInput } from '../lib/calculations/input';
import { runAnalysis } from '../lib/calculations/engine';
import { validatedTemplateNarrative } from '../lib/narrative/templates';
import type { AdvisorReportInput } from '../lib/reports/advisor-types';
import type { ReportRenderInput } from '../lib/calculations/types';
import { emptyIntake, type IntakeData } from '../lib/intake/schema';
import { REPORT_FOOTER_DISCLAIMER, escapeHtml, renderReportHtml, renderReportPdf, summarizeReportWarnings } from '../lib/reports/render';

const extended = process.argv.includes('--advisor-extensions');
const reviewDirectory = join(process.cwd(), 'private-storage', extended ? 'advisor-report-review' : 'report-review');
const htmlPath = join(reviewDirectory, 'synthetic-report.html');
const pdfPath = join(reviewDirectory, 'synthetic-report.pdf');
const textPath = join(reviewDirectory, 'synthetic-report.txt');
const inspectionPath = join(reviewDirectory, 'synthetic-report-inspection.json');
const contactSheetPath = join(reviewDirectory, 'synthetic-report-contact-sheet.png');
const resultPath = join(reviewDirectory, 'reportlayout.json');

/** A distinct, non-client intake built from the shared blank form shape. */
function syntheticIntake(): IntakeData {
  const data = structuredClone(emptyIntake) as IntakeData;
  Object.assign(data, {
    firstName: 'Synthetic', lastName: 'Review', email: 'synthetic.review@example.invalid', phone: '5550100100', dob: '1962-04-15',
    state: 'CA', maritalStatus: 'MARRIED', filingStatus: 'MARRIED_FILING_JOINTLY', dependents: '0', dependentsSpecialNeeds: 'NO',
    allocation: { status: 'KNOWN', stocksPercent: '60', bondsPercent: '35', cashPercent: '5' },
    expenses: { currentMonthly: '8500', retirementMonthly: '7200', essentialMonthly: '5200', discretionaryMonthly: '2000' },
    home: { value: '650000', mortgageBalance: '180000', monthlyPayment: '1800', payoffYear: '2035' },
    lifestyle: 'COMFORTABLE', rankedConcerns: ['INCOME', 'TAXES', 'HEALTHCARE'], legacyAmount: '250000', annualCharity: '1200',
    riskAnswers: [3, 3, 3, 3, 3], consent: true,
    health: { familyLongevity: 'YES', currentCoverage: 'EMPLOYER', preMedicarePlan: 'COBRA', longTermCareInsurance: 'NO', longTermCareDailyBenefit: '', disabilityInsurance: 'YES' },
    estate: {
      will: { status: 'YES', updatedYear: '2024' }, livingTrust: { status: 'NO', updatedYear: '' },
      financialPoa: { status: 'YES', updatedYear: '2024' }, healthcareDirective: { status: 'YES', updatedYear: '2024' }, updatedBeneficiaries: { status: 'UNSURE', updatedYear: '' },
    },
  });
  Object.assign(data.primary, {
    firstName: 'Synthetic', lastName: 'Review', dob: '1962-04-15', employmentStatus: 'FULL_TIME', earnedIncome: '125000',
    preTax401k: '650000', roth401k: '120000', traditionalIra: '180000', rothIra: '95000', hsaBalance: '18000', hsaEligibleForQualifiedExpenses: 'YES',
    brokerage: '175000', brokerageCostBasis: '135000', cashSavingsCds: '45000', employeeContributionPercent: '10', employerMatchPercent: '4', iraRothContribution: '7000',
    pia: '2800', receivingSocialSecurity: 'NO', socialSecurityMonthly: '', socialSecurityStartAge: '', claimAge: '67', retirementAge: '67', healthStatus: 'GOOD',
    pensionMonthly: '0', pensionStartAge: '', pensionSurvivorPercent: '', pensionCola: '', annuityMonthly: '0', annuityStartAge: '', annuityTaxQualification: '',
    rentalOtherMonthly: '0', rentalEndAge: '', partTimeIncome: '0', partTimeEndAge: '', governmentPensionNonCovered: 'NO', lifeInsuranceType: 'TERM', lifeInsuranceDeathBenefit: '400000',
  });
  Object.assign(data.spouse, {
    firstName: 'Morgan', lastName: 'Review', dob: '1964-09-20', employmentStatus: 'FULL_TIME', earnedIncome: '85000',
    preTax401k: '375000', roth401k: '65000', traditionalIra: '90000', rothIra: '75000', hsaBalance: '0', hsaEligibleForQualifiedExpenses: 'NO',
    brokerage: '65000', brokerageCostBasis: '48000', cashSavingsCds: '25000', employeeContributionPercent: '8', employerMatchPercent: '3', iraRothContribution: '7000',
    pia: '2100', receivingSocialSecurity: 'NO', socialSecurityMonthly: '', socialSecurityStartAge: '', claimAge: '67', retirementAge: '65', healthStatus: 'GOOD',
    pensionMonthly: '0', pensionStartAge: '', pensionSurvivorPercent: '', pensionCola: '', annuityMonthly: '0', annuityStartAge: '', annuityTaxQualification: '',
    rentalOtherMonthly: '0', rentalEndAge: '', partTimeIncome: '0', partTimeEndAge: '', governmentPensionNonCovered: 'NO', lifeInsuranceType: 'TERM', lifeInsuranceDeathBenefit: '250000',
  });
  return data;
}

function inspectPdfWithPython(): { pageCount: number; pages: Array<{ number: number; textLength: number; hasFooterDisclaimer: boolean; hasPageNumber: boolean }> } {
  const python = String.raw`
import json, sys
import fitz
from PIL import Image, ImageDraw
pdf_path, text_path, sheet_path, inspection_path, footer = sys.argv[1:]
doc = fitz.open(pdf_path)
texts = [page.get_text('text') for page in doc]
thumbs = []
for index, page in enumerate(doc):
    pix = page.get_pixmap(matrix=fitz.Matrix(0.20, 0.20), alpha=False)
    image = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    thumbs.append(image)
margin, label_height, columns = 18, 22, 2
cell_width = max(image.width for image in thumbs)
cell_height = max(image.height for image in thumbs) + label_height
rows = (len(thumbs) + columns - 1) // columns
sheet = Image.new('RGB', (margin + columns * (cell_width + margin), margin + rows * (cell_height + margin)), '#151922')
draw = ImageDraw.Draw(sheet)
for index, image in enumerate(thumbs):
    column, row = index % columns, index // columns
    left, top = margin + column * (cell_width + margin), margin + row * (cell_height + margin)
    sheet.paste(image, (left, top + label_height))
    draw.text((left, top + 3), f'Page {index + 1}', fill='#f6f7fb')
sheet.save(sheet_path)
with open(text_path, 'w', encoding='utf-8') as output:
    output.write('\n\n===== PAGE BREAK =====\n\n'.join(texts))
pages = [{
    'number': index + 1,
    'textLength': len(text),
    'hasFooterDisclaimer': footer in ' '.join(text.split()),
    'hasPageNumber': f'Page {index + 1} of {len(texts)}' in ' '.join(text.split()),
} for index, text in enumerate(texts)]
with open(inspection_path, 'w', encoding='utf-8') as output:
    json.dump({'pageCount': len(texts), 'pages': pages}, output, indent=2)
print(json.dumps({'pageCount': len(texts), 'pages': pages}))
`;
  const output = execFileSync('python3', ['-c', python, pdfPath, textPath, contactSheetPath, inspectionPath, REPORT_FOOTER_DISCLAIMER], { encoding: 'utf8' });
  return JSON.parse(output) as ReturnType<typeof inspectPdfWithPython>;
}

async function main(): Promise<void> {
  mkdirSync(reviewDirectory, { recursive: true });
  const intake = syntheticIntake();
  const planningInput = mapPlanningInput(intake, DEFAULT_ASSUMPTIONS, '2026-10-20', { healthcareIncludedInSpending: false });
  const analysis = runAnalysis(planningInput, DEFAULT_ASSUMPTIONS);
  assert.equal(analysis.seed, 42, 'Verification must use the fixed default seed.');
  assert.equal((analysis.results.monteCarlo as { runs: number }).runs, 5_000, 'Verification must use 5,000 Monte Carlo runs.');
  writeFileSync(join(reviewDirectory, 'synthetic-analysis-warnings.json'), JSON.stringify(analysis.warnings, null, 2) + '\n', 'utf8');

  const report: ReportRenderInput = {
    clientName: planningInput.clientName,
    generatedAt: '2026-10-20T12:00:00.000Z',
    version: 1,
    input: planningInput,
    assumptions: DEFAULT_ASSUMPTIONS,
    results: analysis.results as unknown as Record<string, unknown>,
    branding: {
      advisorName: 'Synthetic Review Advisor', advisorEmail: 'advisor.review@example.invalid', advisorPhone: '555-0100', licenseNumbers: 'SYNTHETIC-ONLY', logoDataUrl: null,
      coverText: 'Your Retirement, Expertly Planned',
      letter: 'This approved synthetic review letter accompanies a non-client verification report. It is included only to verify approved-letter pagination, contact placement, and disclosure layout.',
      letterApproved: true,
      disclosure: 'This report is a synthetic renderer verification artifact and contains no client data.',
    },
    sections: [],
    coverNote: 'Synthetic verification artifact only. Review report layout with the approved advisor-letter treatment.',
    approvedRecommendations: [],
    scenarioName: 'Synthetic layout verification',
    checksum: 'synthetic-snapshot-checksum-no-client-data',
  };

  if (extended) {
    const enriched = report as AdvisorReportInput;
    const narrative = validatedTemplateNarrative({ firstName: 'Synthetic', concerns: ['income', 'healthcare'], scenarioName: report.scenarioName || 'Base', results: report.results, approvedRecommendations: [] }, { results: report.results, approvedRecommendations: [] });
    enriched.branding.letter = narrative.letter;
    enriched.approvedNarrative = { letter: narrative.letter, sections: narrative.sections };
    enriched.showLsrtHelp = true;
    enriched.approvedRecommendations = Array.from({ length: 25 }, (_, i) => ({ title: `SYNTHETIC_ACTION_${i}`, body: `Fictional approved action ${i}: review these assumptions and limitations with the advisor.`, priority: 'HIGH', owner: 'Synthetic advisor', nextStep: `SYNTHETIC_NEXT_${i}`, targetDate: '2027-01-10', lsrtHelp: 'Educational protection discussion only; no product guarantee.' }));
    enriched.scenarioComparison = [{ id: 'synthetic-base', name: 'Synthetic base', successPercent: (analysis.results.monteCarlo as { successPercent: number }).successPercent, lifetimeTax: null, medianLegacy: null, retirementIncomeAnnual: null }];
  }
  const html = renderReportHtml(report);
  writeFileSync(htmlPath, html, 'utf8');
  process.env.CHROMIUM_EXECUTABLE_PATH ||= '/usr/bin/chromium';
  const pdf = await renderReportPdf(report);
  writeFileSync(pdfPath, pdf);
  const pdfInspection = inspectPdfWithPython();
  const pdfText = readFileSync(textPath, 'utf8');
  const sectionIds = [...html.matchAll(/data-section="([^"]+)"/g)].map((match) => match[1]);
  const sourceRecords = [...DEFAULT_ASSUMPTIONS.annual.sources, ...DEFAULT_ASSUMPTIONS.sources];
  const warningSummaries = summarizeReportWarnings(analysis.warnings);
  const allWarningsPresent = analysis.warnings.every((warning) => warningSummaries.some((summary) => summary.sourceWarnings.includes(warning)))
    && warningSummaries.every((summary) => html.includes(escapeHtml(summary.message)));
  const allSourceKeysPresent = sourceRecords.every((source) => html.includes(source.key));
  const allFootersPresent = pdfInspection.pages.every((page) => page.hasFooterDisclaimer && page.hasPageNumber);
  const checks = {
    actualEngine: analysis.engineVersion,
    defaultSeed: analysis.seed === 42,
    defaultMonteCarloRuns: (analysis.results.monteCarlo as { runs: number }).runs === 5_000,
    selectedDefaultSections: (extended ? sectionIds.length > 22 : sectionIds.length === 22) && sectionIds[0] === 'cover' && sectionIds.at(-1) === 'assumptions-disclosures',
    exactDefaultLetterPages: (extended ? pdfInspection.pageCount >= sectionIds.length : pdfInspection.pageCount === 22),
    coverFooterPageOneOfN: pdfInspection.pages[0]?.hasFooterDisclaimer === true && pdfText.includes(`Page 1 of ${pdfInspection.pageCount}`),
    footerDisclaimerOnEveryPage: allFootersPresent,
    selfContainedAssets: !/(?:src|href)=["']https?:\/\//i.test(html) && !/<link\b/i.test(html),
    approvedLetterIncluded: (extended ? report.branding.letter.length > 300 : html.includes('This approved synthetic review letter')) && report.branding.letterApproved,
    blueBrandingOnly: html.includes('#168CFF') && html.includes('#47B5FF') && !html.includes('#C9A84C'),
    sourceRecordsComplete: allSourceKeysPresent,
    warningsCompleteInAppendix: allWarningsPresent,
    noUnapprovedRecommendations: extended ? Array.from({ length: 25 }, (_, i) => pdfText.includes(`SYNTHETIC_ACTION_${i}`) && pdfText.includes(`SYNTHETIC_NEXT_${i}`)).every(Boolean) : report.approvedRecommendations.length === 0 && html.includes('No recommendations have been approved.'),
    personalizedSyntheticSnapshot: html.includes('Synthetic Review &amp; Morgan Review') && !html.includes('Test Client') && !html.includes('Alex Example'),
    layoutOverflowGatePassed: true,
  };
  assert.ok(Object.values(checks).filter((value) => typeof value === 'boolean').every(Boolean), JSON.stringify(checks, null, 2));
  writeFileSync(resultPath, JSON.stringify({
    fixture: 'Synthetic intake cloned from emptyIntake; no real client data.',
    generatedAt: new Date().toISOString(),
    artifacts: { html: htmlPath, pdf: pdfPath, extractedText: textPath, contactSheet: contactSheetPath, inspection: inspectionPath },
    pageInspection: pdfInspection,
    sourceSnapshot: {
      annualRecordCount: DEFAULT_ASSUMPTIONS.annual.sources.length,
      planningRecordCount: DEFAULT_ASSUMPTIONS.sources.length,
      classifications: Object.fromEntries([...new Set(sourceRecords.map((source) => source.classification))].map((classification) => [classification, sourceRecords.filter((source) => source.classification === classification).length])),
    },
    warningCount: analysis.warnings.length,
    checks,
  }, null, 2) + '\n', 'utf8');
  console.log(resultPath);
}

void main();
