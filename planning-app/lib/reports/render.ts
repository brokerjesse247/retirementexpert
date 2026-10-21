import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PlanningAssumptions, PlanningInput, ReportRenderInput } from '../calculations/types';
import type { AdvisorReportInput } from './advisor-types';
import { roundMoney } from '../calculations/math';
import {
  escapeSvg,
  renderAllocationBarsSvg,
  renderDonutChartSvg,
  renderFanChartSvg,
  renderGaugeSvg,
  renderIncomePlanSvg,
  renderLineChartSvg,
  renderMultiLineChartSvg,
  type ChartPoint,
  type ChartSlice,
} from './charts';

export { escapeSvg, renderAllocationBarsSvg, renderDonutChartSvg, renderFanChartSvg, renderGaugeSvg, renderIncomePlanSvg, renderLineChartSvg, renderMultiLineChartSvg } from './charts';

export const REPORT_SECTION_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'advisor-letter', label: 'Advisor letter & contents' },
  { id: 'executive-summary', label: 'Executive summary' },
  { id: 'your-information', label: 'Your information' },
  { id: 'net-worth', label: 'Net worth & tax buckets' },
  { id: 'social-security', label: 'Social Security' },
  { id: 'retirement-income', label: 'Retirement income plan' },
  { id: 'monte-carlo', label: 'Monte Carlo' },
  { id: 'withdrawal-strategy', label: 'Withdrawal strategy' },
  { id: 'tax-plan', label: 'Tax plan & Roth conversions' },
  { id: 'rmds', label: 'Required minimum distributions' },
  { id: 'healthcare-medicare', label: 'Healthcare & Medicare' },
  { id: 'long-term-care', label: 'Long-term care' },
  { id: 'investments', label: 'Investments' },
  { id: 'protection-estate', label: 'Protection & estate' },
  { id: 'action-plan', label: 'Approved action plan' },
  { id: 'glossary', label: 'Glossary' },
  { id: 'assumptions-disclosures', label: 'Assumptions & disclosures' },
];

export const REPORT_FOOTER_DISCLAIMER = 'This report is for educational and illustrative purposes only. Projections are hypothetical and are not guarantees.';
export const REPORT_FULL_DISCLAIMER = 'This report is for educational and illustrative purposes only. It is based on information you provided and on assumptions that may not occur. Projections are hypothetical, are not guarantees, and do not reflect actual investment results. LSRT Insurance does not provide tax or legal advice; consult a qualified tax professional or attorney. Insurance product guarantees are subject to the claims-paying ability of the issuing company.';

export interface ReportPdfRuntimeStatus {
  executablePath: string;
  productionUnavailable: boolean;
  configuredByEnvironment: boolean;
}

export class ReportPdfRuntimeError extends Error {
  readonly code = 'REPORT_PDF_RUNTIME_UNAVAILABLE';
  constructor(message: string) {
    super(message);
    this.name = 'ReportPdfRuntimeError';
  }
}

type JsonRecord = Record<string, unknown>;
type Page = { id: string; title: string; body: string; cover?: boolean };

const REPORT_BLUE = '#168CFF';
const REPORT_LIGHT_BLUE = '#47B5FF';
const FULL_DEFAULT_SECTION_IDS = REPORT_SECTION_OPTIONS.map((option) => option.id);

/** Escape all client, advisor, and saved-result text before interpolation into HTML. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textWithBreaks(value: unknown): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown): JsonRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function safelyRounded(value: number): number {
  try {
    return roundMoney(value);
  } catch {
    return value;
  }
}

/** The renderer never creates a monetary value; it only rounds supplied finite values for presentation. */
export function formatMoney(value: unknown): string {
  const numeric = finiteNumber(value);
  if (numeric === null) return 'Not available';
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(safelyRounded(numeric));
}

function formatPlainNumber(value: unknown, digits = 0): string {
  const numeric = finiteNumber(value);
  return numeric === null ? 'Not available' : new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(numeric);
}

type PercentageUnit = 'FRACTION' | 'PERCENTAGE_POINTS';

/**
 * Formats a value only after its producing calculation contract has declared
 * the unit. Ratios/rates are fractions; engine success values are points.
 */
function formatPercent(value: unknown, unit: PercentageUnit): string {
  const numeric = finiteNumber(value);
  if (numeric === null) return 'Not available';
  const percentage = unit === 'FRACTION' ? numeric * 100 : numeric;
  return `${percentage.toFixed(1)}%`;
}

function formatDate(value: string): string {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return escapeHtml(value);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }).format(parsed);
}

function pathValue(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const part of path.split('.')) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function firstValue(source: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const value = pathValue(source, path);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function firstNumber(source: unknown, paths: string[]): number | null {
  return finiteNumber(firstValue(source, paths));
}

function firstText(source: unknown, paths: string[]): string | null {
  const value = firstValue(source, paths);
  return typeof value === 'string' && value.trim() ? value : null;
}

function moduleResult(results: Record<string, unknown>, names: string[]): JsonRecord | undefined {
  for (const name of names) {
    const candidate = record(results[name]);
    if (!candidate) continue;
    const nested = record(candidate.result) ?? record(candidate.results);
    return nested ?? candidate;
  }
  return undefined;
}

function warningsFor(result: JsonRecord | undefined): string[] {
  if (!result) return [];
  const nestedMeta = record(result.meta);
  return [...array(result.warnings), ...array(nestedMeta?.warnings)]
    .filter((warning): warning is string => typeof warning === 'string' && warning.trim().length > 0);
}

function moduleStatus(result: JsonRecord | undefined): 'COMPLETE' | 'PARTIAL' | 'UNSUPPORTED' | null {
  const status = firstText(result, ['status', 'meta.status']);
  return status === 'COMPLETE' || status === 'PARTIAL' || status === 'UNSUPPORTED' ? status : null;
}

function reportWarning(label: string, result: JsonRecord | undefined): string {
  if (!result) return `<p class="warning"><strong>Analysis unavailable:</strong> ${escapeHtml(label)} was not supplied in the saved engine results.</p>`;
  const warnings = warningsFor(result);
  if (!warnings.length) return '';
  return `<aside class="warning warning-summary"><strong>${warnings.length} saved input or model limit${warnings.length === 1 ? '' : 's'} to review:</strong> ${escapeHtml(label)}. Full warning text appears in the Assumptions &amp; disclosures appendix.</aside>`;
}

function field(label: string, value: string): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function table(headers: string[], rows: string[][], compact = false): string {
  if (!rows.length) return '<p class="missing">No corresponding analysis rows were supplied.</p>';
  return `<div class="table-wrap"><table class="${compact ? 'compact' : ''}"><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function textCell(value: unknown): string { return escapeHtml(value === null || value === undefined || value === '' ? 'Not available' : value); }
function moneyCell(value: unknown): string { return escapeHtml(formatMoney(value)); }
function percentCell(value: unknown, unit: PercentageUnit): string { return escapeHtml(formatPercent(value, unit)); }

function page(title: string, id: string, body: string): Page {
  return { title, id, body };
}

function safeLogo(logoDataUrl: string | null | undefined): string {
  if (!logoDataUrl || !/^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i.test(logoDataUrl)) return '';
  return `<img class="brand-logo" alt="LSRT Insurance logo" src="${escapeHtml(logoDataUrl)}">`;
}

function localFontDataUrl(fileName: string): string | null {
  try {
    const data = readFileSync(join(process.cwd(), 'public', 'fonts', fileName));
    return `data:font/ttf;base64,${data.toString('base64')}`;
  } catch {
    return null;
  }
}

function fontCss(): string {
  const manrope = localFontDataUrl('Manrope.ttf');
  const dmSans = localFontDataUrl('DM-Sans.ttf');
  return `${manrope ? `@font-face{font-family:ReportManrope;src:url(${manrope}) format('truetype');font-display:block;}` : ''}${dmSans ? `@font-face{font-family:ReportDMSans;src:url(${dmSans}) format('truetype');font-display:block;}` : ''}`;
}

function selectedSections(input: ReportRenderInput): Set<string> {
  const requested = input.sections.length ? input.sections : FULL_DEFAULT_SECTION_IDS;
  const known = new Set(REPORT_SECTION_OPTIONS.map((option) => option.id));
  return new Set(requested.filter((id) => known.has(id)));
}

function include(sections: Set<string>, id: string): boolean { return sections.has(id); }

function friendlyRole(role: unknown): string { return role === 'SPOUSE' ? 'Spouse' : 'Primary'; }
function personName(input: PlanningInput, role: unknown): string {
  const person = input.persons.find((item) => item.role === role);
  return person?.name || friendlyRole(role);
}
function ageText(months: unknown): string {
  const value = finiteNumber(months);
  return value === null ? 'Not available' : `${Math.floor(value / 12)} years ${Math.round(value % 12)} months`;
}

function claimAgesText(value: unknown): string {
  const ages = record(value);
  if (!ages) return 'Not supplied';
  const labels = Object.entries(ages).map(([role, months]) => {
    const numeric = finiteNumber(months);
    return numeric === null ? null : `${friendlyRole(role)} ${Math.floor(numeric / 12)}y ${Math.round(numeric % 12)}m`;
  }).filter((item): item is string => item !== null);
  return labels.length ? labels.join('; ') : 'Not supplied';
}

function sumFinite(values: unknown[]): number | null {
  const numbers = values.map(finiteNumber).filter((value): value is number => value !== null);
  return numbers.length ? safelyRounded(numbers.reduce((sum, value) => sum + value, 0)) : null;
}

function cashFlowRows(result: JsonRecord | undefined): JsonRecord[] {
  return array(result?.rows).map(record).filter((item): item is JsonRecord => Boolean(item));
}

function everyFiveYears(rows: JsonRecord[]): JsonRecord[] {
  if (!rows.length) return [];
  return rows.filter((row, index) => index === 0 || index === rows.length - 1 || index % 5 === 0);
}

function informationPage(input: ReportRenderInput): Page {
  const people = input.input.persons;
  const inputWarnings = input.input.warnings.filter((warning) => warning.trim().length > 0);
  const rows = people.map((person) => [
    escapeHtml(friendlyRole(person.role)), escapeHtml(person.name || 'Not available'), escapeHtml(person.dob || 'Not available'),
    escapeHtml(ageText(person.ageMonths)), escapeHtml(ageText(person.retirementAgeMonths)), escapeHtml(person.healthStatus || 'Not supplied'),
  ]);
  const assumptions = input.assumptions;
  const assumptionRows = [
    ['General inflation', formatPercent(assumptions.inflation, 'FRACTION')], ['Healthcare inflation', formatPercent(assumptions.healthcareInflation, 'FRACTION')],
    ['Social Security COLA', formatPercent(assumptions.socialSecurityCola, 'FRACTION')], ['Planning rules year', String(assumptions.year)],
    ['Assumption version', assumptions.version || 'Not supplied'], ['Risk profile', input.input.riskProfile || 'Not supplied'],
  ].map(([label, value]) => [escapeHtml(label), escapeHtml(value)]);
  const warningHtml = inputWarnings.length
    ? `<aside class="warning"><strong>Client-provided data warnings:</strong><ul>${inputWarnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></aside>`
    : '<p class="note">No client-provided input warnings were included in the saved input snapshot.</p>';
  return page('Your information', 'your-information', `<p class="lede">This page records the snapshot of information and planning assumptions used to create this report. Please review it with your advisor.</p>${table(['Role', 'Name', 'Date of birth', 'Current age', 'Retirement age', 'Health status'], rows, true)}<div class="two-column"><section><h2>Household planning inputs</h2>${table(['Input', 'Value'], [['Filing status', escapeHtml(input.input.filingStatus)], ['State', escapeHtml(input.input.state || 'Not supplied')], ['Current monthly spending', moneyCell(input.input.currentMonthlySpending)], ['Retirement monthly spending', moneyCell(input.input.retirementMonthlySpending)], ['Essential monthly spending', moneyCell(input.input.essentialMonthlySpending)], ['Legacy goal', moneyCell(input.input.legacyGoal)]], true)}</section><section><h2>Assumptions snapshot</h2>${table(['Assumption', 'Value'], assumptionRows, true)}</section></div>${warningHtml}`);
}

function executivePage(input: ReportRenderInput, results: Record<string, unknown>): Page {
  const readiness = moduleResult(results, ['readiness']);
  const monteCarlo = moduleResult(results, ['monteCarlo', 'monte-carlo']);
  const netWorth = moduleResult(results, ['netWorth', 'net-worth']);
  const cashFlow = moduleResult(results, ['cashFlow', 'cash-flow']);
  const readinessScore = firstNumber(readiness, ['score']);
  const successPercent = firstNumber(monteCarlo, ['successPercent']);
  const incomeCoverage = firstNumber(cashFlow, ['incomeCoverageRatio']);
  const cards = [
    field('Retirement readiness score', readinessScore === null ? 'Not available' : `${formatPlainNumber(readinessScore, 1)} / 100`),
    field('Monte Carlo success', formatPercent(successPercent, 'PERCENTAGE_POINTS')),
    field('Net worth', formatMoney(firstNumber(netWorth, ['netWorth']))),
    field('Income coverage ratio', formatPercent(incomeCoverage, 'FRACTION')),
  ].join('');
  const traffic = [
    ['Income', moduleResult(results, ['cashFlow', 'cash-flow'])], ['Social Security', moduleResult(results, ['socialSecurity', 'social-security'])],
    ['Tax', moduleResult(results, ['tax', 'taxes'])], ['Healthcare', moduleResult(results, ['healthcare'])],
    ['Long-term care', moduleResult(results, ['ltc'])], ['Investments', moduleResult(results, ['allocation'])],
    ['Protection', moduleResult(results, ['estate'])], ['Estate', moduleResult(results, ['estate'])],
  ].map(([label, result]) => {
    const status = moduleStatus(result as JsonRecord | undefined);
    const className = status === 'COMPLETE' ? 'green' : status === 'PARTIAL' ? 'amber' : status === 'UNSUPPORTED' ? 'red' : 'gray';
    const statusText = status === 'COMPLETE' ? 'Complete' : status === 'PARTIAL' ? 'Partial' : status === 'UNSUPPORTED' ? 'Unsupported' : 'Not assessed';
    return `<div class="traffic ${className}"><strong>${escapeHtml(label)}</strong><span>${statusText}</span></div>`;
  }).join('');
  const actions = input.approvedRecommendations.slice(0, 3);
  const actionHtml = actions.length ? `<ol class="actions">${actions.map((item) => `<li><strong>${escapeHtml(item.priority)}:</strong> ${escapeHtml(item.title)}<br><span>${escapeHtml(item.body)}</span></li>`).join('')}</ol>` : '<p class="missing">No recommendations have been approved.</p>';
  return page('Executive summary', 'executive-summary', `<p class="lede">A concise view of the saved analysis snapshot. Availability indicators below describe the supplied engine output; they are not a financial rating.</p><div class="metrics">${cards}</div><div class="two-column"><section><h2>Analysis coverage</h2><div class="traffic-grid">${traffic}</div></section><section><h2>Approved next actions</h2>${actionHtml}</section></div>${reportWarning('Readiness analysis', readiness)}${reportWarning('Monte Carlo analysis', monteCarlo)}`);
}

function netWorthPage(input: ReportRenderInput, results: Record<string, unknown>): Page {
  const netWorth = moduleResult(results, ['netWorth', 'net-worth']);
  const buckets: ChartSlice[] = [
    { label: 'Taxable', value: firstNumber(netWorth, ['taxable']) }, { label: 'Tax-deferred', value: firstNumber(netWorth, ['taxDeferred']) }, { label: 'Tax-free', value: firstNumber(netWorth, ['taxFree']) },
  ];
  const rows = input.input.accounts.map((account) => [escapeHtml(friendlyRole(account.owner)), escapeHtml(account.type.replaceAll('_', ' ')), moneyCell(account.balance), escapeHtml(account.costBasis === null ? 'Not supplied' : formatMoney(account.costBasis))]);
  return page('Net worth & tax buckets', 'net-worth', `<p class="lede">Account values are drawn from the saved input snapshot. Summary totals and tax diversification come only from the supplied net-worth analysis.</p><div class="two-column"><section><div class="metrics compact-metrics">${field('Investable assets', formatMoney(firstNumber(netWorth, ['totalInvestable'])))}${field('Home equity', formatMoney(firstNumber(netWorth, ['homeEquity'])))}${field('Net worth', formatMoney(firstNumber(netWorth, ['netWorth'])))}${field('Emergency fund months', formatPlainNumber(firstNumber(netWorth, ['emergencyFundMonths']), 1))}${field('Tax diversification score', formatPlainNumber(firstNumber(netWorth, ['taxDiversificationScore']), 1))}</div>${table(['Owner', 'Account', 'Balance', 'Cost basis'], rows, true)}</section><section><h2>Tax buckets</h2>${renderDonutChartSvg(buckets, { title: 'Tax bucket balances' })}<p class="note">Tax-bucket allocations are informational and do not constitute investment advice.</p></section></div>${reportWarning('Net-worth analysis', netWorth)}`);
}

function socialSecurityPages(input: ReportRenderInput, results: Record<string, unknown>): Page[] {
  const social = moduleResult(results, ['socialSecurity', 'social-security']);
  const people = array(social?.people).map(record).filter((item): item is JsonRecord => Boolean(item));
  const personRows = people.map((person) => [
    textCell(firstText(person, ['role']) ?? 'Not supplied'), textCell(firstText(person, ['name']) ?? 'Not supplied'), textCell(ageText(firstNumber(person, ['fraMonths']))),
    moneyCell(firstNumber(person, ['at62', 'benefitAt62'])), moneyCell(firstNumber(person, ['atFra', 'benefitAtFra'])), moneyCell(firstNumber(person, ['at70', 'benefitAt70'])),
  ]);
  const curveRecord = record(social?.curves);
  const curveSeries = [
    ['Claim at 62', 'at62', REPORT_BLUE], ['Claim at FRA', 'atFra', REPORT_LIGHT_BLUE], ['Claim at 70', 'at70', '#8A78FF'],
  ].map(([label, key, color]) => ({ label, color, points: array(curveRecord?.[key]).map(record).filter((item): item is JsonRecord => Boolean(item)).map((point, index) => ({ label: String(firstValue(point, ['year', 'age']) ?? index + 1), value: firstNumber(point, ['cumulative']) })) }));
  const breakEvens = Object.entries(record(curveRecord?.breakEvenAges) ?? {}).map(([comparison, age]) => [escapeHtml(comparison.replace(/([A-Z])/g, ' $1')), escapeHtml(finiteNumber(age) === null ? 'Not available' : `${formatPlainNumber(age, 2)} years`)]);
  const planned = record(social?.planned);
  const best = record(social?.best);
  const early = record(social?.early);
  const strategyRows = [
    ['Planned strategy', formatMoney(firstNumber(planned, ['cumulativeBenefits'])), formatMoney(firstNumber(planned, ['presentValue'])), claimAgesText(firstValue(planned, ['claimAgesMonths']))],
    ['Best strategy supplied by engine', formatMoney(firstNumber(best, ['cumulativeBenefits'])), formatMoney(firstNumber(best, ['presentValue'])), claimAgesText(firstValue(best, ['claimAgesMonths']))],
    ['Claim at 62 comparison', formatMoney(firstNumber(early, ['cumulativeBenefits'])), formatMoney(firstNumber(early, ['presentValue'])), claimAgesText(firstValue(early, ['claimAgesMonths']))],
  ].map((row) => row.map(escapeHtml));
  return [
    page('Social Security benefits', 'social-security-benefits', `<p class="lede">Benefits, claiming ages, and FRA values below are supplied by the Social Security engine. Claiming decisions should be confirmed against an SSA record.</p>${table(['Role', 'Name', 'Full retirement age', 'Age 62 / month', 'FRA / month', 'Age 70 / month'], personRows, true)}<div class="metrics">${field('Survivor income drop / month', formatMoney(firstNumber(social, ['survivorIncomeDropMonthly'])))}${field('Lifetime difference', formatMoney(firstNumber(social, ['lifetimeDifference'])))}</div>${reportWarning('Social Security analysis', social)}`),
    page('Social Security claiming strategy', 'social-security-strategy', `<p class="lede">Cumulative-benefit curves are shown only when the saved engine supplied a curve. Break-even timing, earnings-test effects, taxation, and survivor assumptions are noted by the engine warnings.</p>${renderMultiLineChartSvg(curveSeries, { title: 'Cumulative Social Security benefits by claiming age' })}${table(['Strategy', 'Cumulative benefits', 'Present value', 'Claim age(s)'], strategyRows, true)}<h2>Break-even markers</h2>${table(['Comparison', 'Break-even age'], breakEvens, true)}${reportWarning('Social Security analysis', social)}`),
  ];
}

function retirementIncomePages(results: Record<string, unknown>): Page[] {
  const cashFlow = moduleResult(results, ['cashFlow', 'cash-flow']);
  const rows = cashFlowRows(cashFlow);
  const incomePoints = rows.map((row, index) => ({
    label: String(firstValue(row, ['year', 'age']) ?? index + 1),
    incomeSources: ['socialSecurity', 'pension', 'annuity', 'otherIncome', 'wages'].map((name) => firstNumber(row, [name])),
    spending: firstNumber(row, ['spending']),
  }));
  const displayedRows = everyFiveYears(rows).map((row) => [
    textCell(firstValue(row, ['year']) ?? 'Not supplied'), textCell(firstValue(row, ['age']) ?? 'Not supplied'), moneyCell(firstNumber(row, ['spending'])), moneyCell(firstNumber(row, ['healthcare'])), moneyCell(firstNumber(row, ['socialSecurity'])), moneyCell(firstNumber(row, ['pension'])), moneyCell(firstNumber(row, ['annuity'])), moneyCell(firstNumber(row, ['portfolioWithdrawal'])), moneyCell(firstNumber(row, ['endingBalance'])),
  ]);
  return [
    page('Retirement income plan', 'retirement-income-overview', `<p class="lede">This chart reflects saved cash-flow rows. It does not estimate any income source that is absent from those results.</p>${renderIncomePlanSvg(incomePoints, { title: 'Income sources and spending need by projected year' })}<div class="metrics">${field('Income coverage ratio', formatPercent(firstNumber(cashFlow, ['incomeCoverageRatio']), 'FRACTION'))}${field('Portfolio at retirement', formatMoney(firstNumber(cashFlow, ['portfolioAtRetirement'])))}${field('Depletion age', formatPlainNumber(firstNumber(cashFlow, ['depletionAge'])))}${field('Ending legacy', formatMoney(firstNumber(cashFlow, ['endingLegacy'])))}</div><p class="note">The income floor is the income supplied in the cash-flow analysis; flexible spending is not inferred when the client did not provide an essential/discretionary split.</p>${reportWarning('Cash-flow analysis', cashFlow)}`),
    page('Retirement income plan — projection table', 'retirement-income-table', `<p class="lede">Projection rows are shown at five-year intervals plus the final year to keep this Letter-page table readable.</p>${table(['Year', 'Age', 'Spending', 'Healthcare', 'Social Security', 'Pension', 'Annuity', 'Portfolio withdrawal', 'Ending balance'], displayedRows, true)}${reportWarning('Cash-flow analysis', cashFlow)}`),
  ];
}

function monteCarloPage(input: ReportRenderInput, results: Record<string, unknown>): Page {
  const monteCarlo = moduleResult(results, ['monteCarlo', 'monte-carlo']);
  const fanRows = array(monteCarlo?.fanChart).map(record).filter((item): item is JsonRecord => Boolean(item));
  const fanPoints: ChartPoint[] = fanRows.map((row, index) => ({ label: String(firstValue(row, ['year', 'age']) ?? index + 1), lower: firstNumber(row, ['p10', 'p10Ending']), value: firstNumber(row, ['median', 'p50']), upper: firstNumber(row, ['p90', 'p90Ending']) }));
  const methodology = record(monteCarlo?.methodology);
  const stress = record(monteCarlo?.sequenceStress);
  const methodRows = Object.entries(methodology ?? {}).map(([key, value]) => [escapeHtml(key.replace(/([A-Z])/g, ' $1')), escapeHtml(textCell(value))]);
  return page('Monte Carlo analysis', 'monte-carlo', `<p class="lede">Monte Carlo results are scenario simulations, not forecasts or guarantees. The supplied result controls every number shown here.</p><div class="two-column"><section>${renderGaugeSvg(firstNumber(monteCarlo, ['successPercent']), { title: 'Success probability', suffix: '%' })}<div class="metrics compact-metrics">${field('Median ending value', formatMoney(firstNumber(monteCarlo, ['medianEnding'])))}${field('10th percentile ending value', formatMoney(firstNumber(monteCarlo, ['p10Ending'])))}${field('90th percentile ending value', formatMoney(firstNumber(monteCarlo, ['p90Ending'])))}${field('Worst-decile depletion age', formatPlainNumber(firstNumber(monteCarlo, ['worstDecileDepletionAge'])))}</div></section><section><h2>Percentile fan chart</h2>${renderFanChartSvg(fanPoints, { title: 'Monte Carlo ending balance percentile fan' })}<p class="note">Engine version: ${escapeHtml(input.assumptions.version || 'Not supplied')}. Runs: ${escapeHtml(formatPlainNumber(firstNumber(monteCarlo, ['runs'])))}. Seed: ${escapeHtml(textCell(firstValue(monteCarlo, ['seed']) ?? 'Not supplied'))}.</p>${table(['Method element', 'Saved value'], methodRows, true)}<p class="note">Sequence-risk stress: first year ${escapeHtml(formatPercent(firstNumber(stress, ['firstYearReturn']), 'FRACTION'))}; later years ${escapeHtml(formatPercent(firstNumber(stress, ['subsequentYearReturn']), 'FRACTION'))}; ending balance ${escapeHtml(formatMoney(firstNumber(stress, ['endingBalance'])))}; first shortfall ${escapeHtml(formatMoney(firstNumber(stress, ['firstShortfall'])))}.</p></section></div>${reportWarning('Monte Carlo analysis', monteCarlo)}`);
}

function withdrawalsPage(results: Record<string, unknown>): Page {
  const withdrawals = moduleResult(results, ['withdrawals', 'withdrawalStrategies', 'withdrawal-strategies']);
  const guardrails = record(withdrawals?.guardrails);
  const buckets = record(withdrawals?.buckets);
  const cash = record(buckets?.cash);
  const bonds = record(buckets?.bonds);
  const growth = record(buckets?.growth);
  const guardrailRows = [
    ['Initial annual withdrawal', formatMoney(firstNumber(guardrails, ['initialAnnual']))], ['Initial rate', formatPercent(firstNumber(guardrails, ['initialRate']), 'FRACTION')],
    ['Lower rate band', formatPercent(firstNumber(guardrails, ['lowerRate']), 'FRACTION')], ['Upper rate band', formatPercent(firstNumber(guardrails, ['upperRate']), 'FRACTION')], ['Spending adjustment', formatPercent(firstNumber(guardrails, ['spendingAdjustment']), 'FRACTION')],
  ].map(([label, value]) => [escapeHtml(label), escapeHtml(value)]);
  const bucketRows = [
    ['Cash, years 1–2', formatMoney(firstNumber(cash, ['amount'])), formatMoney(firstNumber(cash, ['unfunded']))], ['Bonds, years 3–10', formatMoney(firstNumber(bonds, ['amount'])), formatMoney(firstNumber(bonds, ['unfunded']))],
    ['Growth assets', formatMoney(firstNumber(growth, ['amount'])), '—'], ['Near-term shortfall', formatMoney(firstNumber(buckets, ['nearTermShortfall'])), '—'],
  ].map(([label, amount, unfunded]) => [escapeHtml(label), escapeHtml(amount), escapeHtml(unfunded)]);
  return page('Withdrawal strategy', 'withdrawal-strategy', `<p class="lede">Withdrawal approaches are educational illustrations based on the saved analysis. They are not a distribution recommendation or a guarantee of sustainability.</p><div class="metrics">${field('4% annual amount', formatMoney(firstNumber(withdrawals, ['fourPercentAnnual'])))}${field('Sustainable rate', formatPercent(firstNumber(withdrawals, ['sustainableRate']), 'FRACTION'))}${field('Sustainable annual amount', formatMoney(firstNumber(withdrawals, ['sustainableAnnual'])))}${field('Target success rate', formatPercent(firstNumber(withdrawals, ['method.sustainableRate.targetSuccessPercent']), 'FRACTION'))}</div><div class="two-column"><section><h2>Guardrails</h2>${table(['Measure', 'Saved analysis value'], guardrailRows, true)}</section><section><h2>Bucket strategy</h2>${table(['Bucket', 'Amount', 'Unfunded'], bucketRows, true)}<p class="note">Illustrated withdrawal order: required distributions, available taxable/cash assets, tax-deferred assets within planned tax capacity, then Roth assets as needed. Actual tax outcomes require review.</p></section></div>${reportWarning('Withdrawal-strategy analysis', withdrawals)}`);
}

function taxPages(input: ReportRenderInput, results: Record<string, unknown>): Page[] {
  const tax = moduleResult(results, ['tax', 'taxes']);
  const currentTax = record(tax?.current) ?? tax;
  const cashFlow = moduleResult(results, ['cashFlow', 'cash-flow']);
  const roth = moduleResult(results, ['roth', 'rothConversions', 'roth-conversions']);
  const schedule = array(roth?.schedule).map(record).filter((item): item is JsonRecord => Boolean(item));
  const scheduleRows = schedule.map((row) => [textCell(firstValue(row, ['year']) ?? 'Not supplied'), moneyCell(firstNumber(row, ['amount', 'conversion'])), moneyCell(firstNumber(row, ['estimatedFederalTaxCost', 'taxCost', 'tax'])), percentCell(firstNumber(row, ['targetBracket', 'bracket', 'marginalRate']), 'FRACTION'), textCell(firstValue(row, ['irmaaCheck', 'irmaa']) ?? 'Not supplied')]);
  const contribution = input.assumptions.annual.contributions;
  return [
    page('Tax plan — current and retirement', 'tax-plan-current', `<p class="lede">Current-tax measures are shown only from the supplied tax analysis. Retirement-tax values derive from saved cash-flow results where available.</p><div class="two-column"><section><h2>Current household tax snapshot</h2>${table(['Measure', 'Value'], [['Taxable income', moneyCell(firstNumber(currentTax, ['taxableIncome']))], ['Federal tax', moneyCell(firstNumber(currentTax, ['federalTax']))], ['Marginal rate', percentCell(firstNumber(currentTax, ['marginalRate']), 'FRACTION')], ['Effective rate', percentCell(firstNumber(currentTax, ['effectiveRate']), 'FRACTION')], ['Taxable Social Security', moneyCell(firstNumber(currentTax, ['taxableSocialSecurity']))], ['MAGI', moneyCell(firstNumber(currentTax, ['magi']))]], true)}</section><section><h2>Retirement projection</h2>${table(['Measure', 'Value'], [['Lifetime federal tax', moneyCell(firstNumber(cashFlow, ['lifetimeFederalTax']))], ['Target tax bracket assumption', percentCell(input.assumptions.targetTaxBracket, 'FRACTION')], ['State tax estimate', input.assumptions.stateTaxRate === null ? 'Not modeled' : percentCell(input.assumptions.stateTaxRate, 'FRACTION')]].map((row) => row.map(escapeHtml)), true)}<p class="note">State-tax precision is not claimed when no state tax result was supplied.</p></section></div>${reportWarning('Tax analysis', tax)}${reportWarning('Cash-flow tax projection', cashFlow)}`),
    page('Tax plan — Roth conversions', 'tax-plan-roth', `<p class="lede">Roth-conversion scheduling is displayed only if the Roth engine provided it. IRMAA review depends on available historical MAGI and supplied engine warnings.</p>${table(['Year', 'Conversion', 'Tax cost', 'Bracket', 'IRMAA check'], scheduleRows, true)}<div class="two-column"><section><h2>With / without conversion</h2>${table(['Measure', 'No conversion', 'With conversion'], [['Lifetime tax', moneyCell(firstNumber(record(roth?.noConversion), ['lifetimeFederalTax', 'lifetimeTax', 'tax'])), moneyCell(firstNumber(record(roth?.withConversion), ['lifetimeFederalTax', 'lifetimeTax', 'tax']))], ['After-tax legacy', moneyCell(firstNumber(record(roth?.noConversion), ['afterTaxLegacy', 'legacy'])), moneyCell(firstNumber(record(roth?.withConversion), ['afterTaxLegacy', 'legacy']))]], true)}</section><section><h2>Annual contribution limits in this snapshot</h2>${table(['Limit', 'Value'], [['Workplace contribution', moneyCell(contribution.workplace)], ['Workplace catch-up age 50+', moneyCell(contribution.workplaceCatchup50)], ['Workplace catch-up ages 60–63', moneyCell(contribution.workplaceCatchup60to63)], ['IRA contribution', moneyCell(contribution.ira)], ['IRA catch-up age 50+', moneyCell(contribution.iraCatchup50)]], true)}</section></div>${reportWarning('Roth-conversion analysis', roth)}`),
  ];
}

function rmdPage(input: ReportRenderInput, results: Record<string, unknown>): Page {
  const rmd = moduleResult(results, ['rmd', 'rmds']);
  const rows = array(rmd?.schedule).map(record).filter((item): item is JsonRecord => Boolean(item));
  const people = array(rmd?.people).map(record).filter((item): item is JsonRecord => Boolean(item));
  const startAges = people.map((person) => `${firstText(person, ['name']) ?? friendlyRole(firstValue(person, ['owner']))}: ${formatPlainNumber(firstNumber(person, ['startAge']))}`).join('; ');
  const pairs = rows.map((row) => [textCell(firstValue(row, ['owner']) ?? 'Not supplied'), textCell(firstValue(row, ['age']) ?? 'Not supplied'), moneyCell(firstNumber(row, ['rmd', 'amount'])), textCell(firstValue(row, ['balanceBasisLabel']) ?? '—')]);
  const split = Math.ceil(pairs.length / 2);
  return page('Required minimum distributions', 'rmds', `<p class="lede">Required distributions use the saved RMD analysis. A current balance illustration is not a substitute for a prior December 31 account balance.</p><div class="metrics">${field('RMD start age(s)', startAges || 'Not available')}${field('QCD limit', formatMoney(input.assumptions.annual.qcdLimit))}</div><div class="two-column"><section><h2>Distribution schedule</h2>${table(['Owner', 'Age', 'RMD', 'Basis note'], pairs.slice(0, split), true)}</section><section><h2>Distribution schedule (continued)</h2>${table(['Owner', 'Age', 'RMD', 'Basis note'], pairs.slice(split), true)}</section></div><p class="note">Qualified charitable distributions may be available for eligible IRA owners. Confirm eligibility and current limits with a qualified tax professional.</p>${reportWarning('RMD analysis', rmd)}`);
}

function healthcarePage(results: Record<string, unknown>): Page {
  const healthcare = moduleResult(results, ['healthcare']);
  const rows = array(healthcare?.rows).map(record).filter((item): item is JsonRecord => Boolean(item));
  const preMedicareGapCost = sumFinite(rows.flatMap((row) => array(row.people).map(record).filter((person): person is JsonRecord => Boolean(person)).filter((person) => firstText(person, ['coverage']) === 'PRE_MEDICARE').map((person) => firstNumber(person, ['annual']))));
  const displayed = everyFiveYears(rows).map((row) => {
    const people = array(row.people).map(record).filter((person): person is JsonRecord => Boolean(person));
    const tiers = people.map((person) => firstNumber(person, ['irmaaTier'])).filter((tier): tier is number => tier !== null);
    return [textCell(firstValue(row, ['year', 'age']) ?? 'Not supplied'), moneyCell(firstNumber(row, ['annual', 'cost', 'total'])), moneyCell(sumFinite(people.map((person) => {
      const monthly = firstNumber(person, ['partBMonthly']); return monthly === null ? null : monthly * 12;
    }))), moneyCell(sumFinite(people.map((person) => {
      const monthly = firstNumber(person, ['partDMonthly']); return monthly === null ? null : monthly * 12;
    }))), escapeHtml(tiers.length ? tiers.join(', ') : 'Not applicable')];
  });
  return page('Healthcare & Medicare', 'healthcare-medicare', `<p class="lede">Healthcare estimates are planning assumptions, not carrier quotes. Medicare income-related premiums may use a two-year MAGI lookback.</p><div class="metrics">${field('Pre-Medicare gap cost', formatMoney(preMedicareGapCost))}${field('Lifetime healthcare cost (future dollars)', formatMoney(firstNumber(healthcare, ['lifetimeFutureCost'])))}${field('Lifetime healthcare cost (today’s dollars)', formatMoney(firstNumber(healthcare, ['lifetimePresentCost'])))}${field('HSA coverage years', formatPlainNumber(firstNumber(healthcare, ['hsaCoverageYears']), 1))}</div>${table(['Year / age', 'Annual healthcare', 'Part B', 'Part D surcharge', 'IRMAA tier'], displayed, true)}<div class="two-column"><section><h2>Enrollment timing</h2><p>The Initial Enrollment Period generally spans seven months around age 65. Timing and penalty exceptions depend on individual coverage and employment facts.</p></section><section><h2>Coverage education</h2><p>Medigap supplements Original Medicare; Medicare Advantage is a private plan alternative. The report does not recommend a carrier or plan.</p></section></div>${reportWarning('Healthcare analysis', healthcare)}`);
}

function ltcPage(results: Record<string, unknown>): Page {
  const ltc = moduleResult(results, ['ltc', 'longTermCare', 'long-term-care']);
  return page('Long-term care', 'long-term-care', `<p class="lede">Long-term-care values show the saved stress-test analysis. They do not predict care needs or insurance eligibility.</p><div class="metrics">${field('Projected cost at age 85', formatMoney(firstNumber(ltc, ['costAt85'])))}${field('Existing coverage', formatMoney(firstNumber(ltc, ['existingCoverage'])))}${field('Coverage gap', formatMoney(firstNumber(ltc, ['coverageGap'])))}${field('Event cost', formatMoney(firstNumber(ltc, ['eventCost'])))}${field('Legacy change under stress', formatMoney(firstNumber(ltc, ['legacyChange'])))}${field('Success probability under stress', formatPercent(firstNumber(ltc, ['stressSuccessPercent']), 'PERCENTAGE_POINTS'))}</div><h2>Funding approaches to discuss</h2><div class="four-column"><div class="callout"><strong>Self-fund</strong><span>Use assets designated for care needs.</span></div><div class="callout"><strong>Traditional LTC</strong><span>Insurance coverage subject to underwriting and policy terms.</span></div><div class="callout"><strong>Hybrid life / LTC</strong><span>Life insurance with LTC features subject to contract terms.</span></div><div class="callout"><strong>Annuity rider</strong><span>Potential rider benefits depend on the issuing contract.</span></div></div>${reportWarning('Long-term-care analysis', ltc)}`);
}

function investmentsPage(results: Record<string, unknown>): Page {
  const allocation = moduleResult(results, ['allocation']);
  const current = record(allocation?.current);
  const target = record(allocation?.target);
  const asPercentagePoints = (value: number | null) => value === null ? null : value * 100;
  // AllocationMix is explicitly fractional, while this chart API consumes percentage points.
  const rows = ['stocks', 'bonds', 'cash'].map((label) => ({ label: label[0].toUpperCase() + label.slice(1), current: asPercentagePoints(firstNumber(current, [label])), target: asPercentagePoints(firstNumber(target, [label])) }));
  const glidePath = array(allocation?.glidePath).map(record).filter((item): item is JsonRecord => Boolean(item)).map((row) => [textCell(firstValue(row, ['year', 'age']) ?? 'Not supplied'), percentCell(firstNumber(row, ['equity', 'stocks', 'targetEquity']), 'FRACTION'), textCell(firstValue(row, ['note']) ?? '—')]);
  const rebalancing = record(allocation?.rebalancing);
  return page('Investments', 'investments', `<p class="lede">This is educational allocation analysis. It does not recommend specific securities, trades, or investment products.</p>${renderAllocationBarsSvg(rows, { title: 'Current and target allocation' })}<div class="two-column"><section><h2>Glide path</h2>${table(['Year / age', 'Target equity', 'Note'], glidePath, true)}</section><section><h2>Rebalancing illustration</h2>${table(['Asset class', 'Amount'], Object.entries(rebalancing ?? {}).map(([key, value]) => [escapeHtml(key.replace(/([A-Z])/g, ' $1')), moneyCell(value)]), true)}<p class="note">Asset-location education: bonds are often considered for tax-deferred accounts, growth assets for Roth accounts, and tax-efficient investments for taxable accounts; individual circumstances matter.</p></section></div>${reportWarning('Allocation analysis', allocation)}`);
}

function protectionEstatePage(input: ReportRenderInput, results: Record<string, unknown>): Page {
  const estate = moduleResult(results, ['estate', 'estateAndInsurance']);
  const engineChecklist = array(estate?.checklist).map(record).filter((item): item is JsonRecord => Boolean(item));
  const fallbackChecklist = Object.entries(input.input.estate).map(([label, item]) => ({ label: label.replace(/([A-Z])/g, ' $1'), status: item.status === 'YES' ? 'CURRENT' : item.status === 'NO' ? 'MISSING' : 'UNSURE', lastUpdatedYear: item.updatedYear, detail: 'Input snapshot status.' }));
  const checklist = (engineChecklist.length ? engineChecklist : fallbackChecklist).map((item) => [escapeHtml(String(firstValue(item, ['label']) ?? 'Not supplied')), escapeHtml(String(firstValue(item, ['status']) ?? 'Not supplied')), escapeHtml(String(firstValue(item, ['lastUpdatedYear']) ?? 'Not supplied')), escapeHtml(String(firstValue(item, ['detail']) ?? ''))]);
  const federalFlag = record(estate?.estateTaxFlag);
  const stateFlag = record(estate?.stateEstateTaxFlag);
  return page('Protection & estate', 'protection-estate', `<p class="lede">Insurance and estate observations are educational. Estate planning and tax guidance require qualified legal and tax professionals.</p><div class="metrics">${field('Estimated life-insurance need', formatMoney(firstNumber(estate, ['insuranceNeed'])))}${field('Survivor income gap / month', formatMoney(firstNumber(estate, ['survivorIncomeGapMonthly'])))}${field('Federal estate-tax flag', firstText(federalFlag, ['status']) ?? 'Not supplied')}${field('State estate-tax flag', firstText(stateFlag, ['status']) ?? 'Not supplied')}</div><div class="two-column"><section><h2>Estate-document checklist</h2>${table(['Document', 'Status', 'Updated', 'Detail'], checklist, true)}</section><section><h2>Beneficiary and protection review</h2><p>Beneficiary designations can control account and policy transfers. Review them after life events and coordinate with estate documents.</p><p class="note">Beneficiary review due: ${escapeHtml(textCell(firstValue(estate, ['beneficiaryReviewDue']) ?? 'Not supplied'))}</p><p class="note">Federal note: ${escapeHtml(firstText(federalFlag, ['note']) ?? 'Not supplied')}</p><p class="note">State note: ${escapeHtml(firstText(stateFlag, ['note']) ?? 'Not supplied')}</p><p class="note">Life-insurance calculations are needs illustrations and do not establish insurance availability, pricing, or suitability.</p></section></div>${reportWarning('Estate and insurance analysis', estate)}`);
}

function actionPlanPages(input: ReportRenderInput): Page[] {
  const enriched = input as AdvisorReportInput;
  const approved = enriched.approvedRecommendations;
  if (!approved.length) return [page('Action plan — advisor review', 'action-plan-priority', '<p class="lede">No automated recommendations or dollar impacts are added by the report renderer.</p><p class="missing">No recommendations have been approved.</p><p>Review the model limitations and missing inputs with your advisor before deciding on any action. Tax and estate decisions require qualified professional review.</p>')];
  const rank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const sorted = [...approved].sort((a, b) => (rank[a.priority.toUpperCase()] ?? 3) - (rank[b.priority.toUpperCase()] ?? 3));
  const groups: string[][] = [[]]; let cost = 0;
  for (const item of sorted) {
    const details = [item.body, item.nextStep ? `Next step: ${item.nextStep}` : '', item.dollarImpact != null ? `${item.impactLabel || 'Illustrative dollar impact'}: ${formatMoney(item.dollarImpact)}` : '', enriched.showLsrtHelp && item.lsrtHelp ? `How LSRT can help: ${item.lsrtHelp}` : ''].filter(Boolean).join('\n\n');
    // Each continuation preserves the exact original characters; no ellipsis or discarded content.
    const pieces = details.match(/[\s\S]{1,1200}/g) ?? [''];
    pieces.forEach((piece, index) => {
      const estimate = 120 + Math.ceil(piece.length / 85) * 14 + Math.ceil(item.title.length / 70) * 16;
      if (groups[groups.length - 1].length && cost + estimate > 640) { groups.push([]); cost = 0; }
      const card = `<article class="recommendation"><div class="checkbox">□</div><div><span class="priority ${escapeHtml(item.priority.toLowerCase())}">${escapeHtml(item.priority)}</span><h3>${escapeHtml(item.title)}${index ? ' — continued' : ''}</h3><p>${textWithBreaks(piece)}</p>${index ? '' : `<dl><dt>Owner</dt><dd>${escapeHtml(item.owner || 'Not assigned')}</dd><dt>Target date</dt><dd>${escapeHtml(item.targetDate || 'Not assigned')}</dd></dl>`}</div></article>`;
      groups[groups.length - 1].push(card); cost += estimate;
    });
  }
  return groups.map((cards, index) => page(index ? 'Action plan — continued' : 'Action plan — approved actions', index ? `action-plan-additional-${index}` : 'action-plan-priority', `<p class="lede">Only current advisor-approved actions are included. Confirm each action with your advisor and relevant professional. Illustrative impacts are not guarantees.</p>${cards.join('')}`));
}

function scenarioComparisonPage(input: AdvisorReportInput): Page | null {
  if (!input.scenarioComparison?.length) return null;
  const rows = input.scenarioComparison.slice(0, 3).map(s => [escapeHtml(s.name), s.successPercent == null ? 'Unavailable' : percentCell(s.successPercent, 'PERCENTAGE_POINTS'), s.lifetimeTax == null ? 'Unavailable' : formatMoney(s.lifetimeTax), s.medianLegacy == null ? 'Unavailable' : formatMoney(s.medianLegacy), s.retirementIncomeAnnual == null ? 'Unavailable' : formatMoney(s.retirementIncomeAnnual)]);
  return page('Scenario comparison', 'scenario-comparison', `<p class="lede">These are independently saved alternatives, not changes to the submitted profile. Results use the same calculation engine and their respective saved assumptions.</p>${table(['Scenario', 'Simulation success', 'Lifetime federal tax', 'Median ending assets', 'Retirement-year income'], rows)}<p class="note">Income means annual non-portfolio Social Security, pension, annuity and other income in the modeled retirement year. Ending assets are the seeded simulation median, not a guaranteed legacy. A scenario comparison is educational and is not a product quote.</p>`);
}

function attachApprovedNarrative(pages: Page[], input: AdvisorReportInput): Page[] {
  if (!input.approvedNarrative) return pages;
  const used = new Set<string>();
  return pages.map(sheet => {
    const entry = Object.entries(input.approvedNarrative!.sections).find(([id, text]) => !used.has(id) && Boolean(text) && sheet.id.startsWith(id));
    if (!entry) return sheet;
    used.add(entry[0]);
    const note = `<aside class="approved-narrative" data-narrative-section="${escapeHtml(entry[0])}"><h2>Advisor-reviewed explanation</h2><p>${textWithBreaks(entry[1])}</p></aside>`;
    return { ...sheet, body: note + sheet.body };
  });
}

function glossaryPage(): Page {
  const terms = [
    ['Full retirement age (FRA)', 'The age at which a person may receive an unreduced Social Security retirement benefit.'],
    ['Monte Carlo simulation', 'A model that evaluates many possible return paths; it is not a forecast or guarantee.'],
    ['Required minimum distribution (RMD)', 'A minimum withdrawal generally required from certain retirement accounts after the applicable starting age.'],
    ['Roth conversion', 'Moving eligible pre-tax retirement money to a Roth account and generally recognizing taxable income.'],
    ['IRMAA', 'An income-related adjustment that may increase Medicare Part B and Part D premiums.'],
    ['Income coverage ratio', 'The saved analysis measure comparing guaranteed income with the spending measure used by the cash-flow engine.'],
    ['Tax diversification', 'Holding assets across taxable, tax-deferred, and tax-free account types.'],
    ['Glide path', 'A planned change in stock exposure as retirement approaches.'],
    ['Beneficiary designation', 'A direction for who receives certain assets or policy proceeds; it can operate separately from a will.'],
    ['Present value', 'A value today of projected future cash flows using a stated discount-rate assumption.'],
  ];
  return page('Glossary', 'glossary', `<p class="lede">These plain-language definitions are provided for report readability and are not tax, legal, or investment advice.</p>${table(['Term', 'Meaning'], terms.map(([term, definition]) => [escapeHtml(term), escapeHtml(definition)]), true)}`);
}

export interface ReportWarningSummary { message: string; sourceWarnings: string[] }

function yearRange(years: number[]): string {
  const sorted = [...new Set(years)].sort((left, right) => left - right);
  const ranges: string[] = [];
  for (let index = 0; index < sorted.length;) {
    const start = sorted[index];
    let end = start;
    while (sorted[index + 1] === end + 1) end = sorted[++index];
    ranges.push(start === end ? String(start) : `${start}–${end}`);
    index += 1;
  }
  return ranges.join(', ');
}

/**
 * Repeats from annual healthcare projections are represented as named year
 * ranges, never silently omitted. Every original warning remains associated
 * with exactly one visible summary item for review and verification.
 */
export function summarizeReportWarnings(warnings: string[]): ReportWarningSummary[] {
  const unique = [...new Set(warnings.filter((warning) => warning.trim()))];
  const consumed = new Set<string>();
  const output: ReportWarningSummary[] = [];
  const healthcare = new Map<string, { years: number[]; warnings: string[] }>();
  const magi = new Map<string, { person: string; lookbacks: number[]; estimateYears: number[]; warnings: string[] }>();
  const earnings = new Map<string, { person: string; base: string; years: number[]; warnings: string[] }>();
  const shortfalls: Array<{ year: number; amount: string; warning: string }> = [];
  const healthcarePattern = /^(\d{4}) healthcare costs are planning projections indexed from (\d{4}) at the healthcare-inflation assumption; they are not official future Medicare premiums\.$/;
  const magiPattern = /^No supplied MAGI for (\d{4}); (.+)'s (\d{4}) Medicare estimate uses the standard Part B tier and no Part D IRMAA rather than inventing a two-year lookback\.$/;
  const earningsPattern = /^(.+): earnings-test withholding is not modeled for (\d{4}); only annual SSA rules for (\d{4}) were supplied\.$/;
  const shortfallPattern = /^(\d{4}): cash-flow shortfall of \$(\d+(?:\.\d+)?) is explicit; assets were not allowed to become negative\.$/;
  for (const warning of unique) {
    const healthcareMatch = healthcarePattern.exec(warning);
    if (healthcareMatch) {
      const key = healthcareMatch[2];
      const group = healthcare.get(key) ?? { years: [], warnings: [] };
      group.years.push(Number(healthcareMatch[1])); group.warnings.push(warning); healthcare.set(key, group); consumed.add(warning);
      continue;
    }
    const magiMatch = magiPattern.exec(warning);
    if (magiMatch) {
      const person = magiMatch[2];
      const group = magi.get(person) ?? { person, lookbacks: [], estimateYears: [], warnings: [] };
      group.lookbacks.push(Number(magiMatch[1])); group.estimateYears.push(Number(magiMatch[3])); group.warnings.push(warning); magi.set(person, group); consumed.add(warning);
      continue;
    }
    const earningsMatch = earningsPattern.exec(warning);
    if (earningsMatch) {
      const key = `${earningsMatch[1]}:${earningsMatch[3]}`;
      const group = earnings.get(key) ?? { person: earningsMatch[1], base: earningsMatch[3], years: [], warnings: [] };
      group.years.push(Number(earningsMatch[2])); group.warnings.push(warning); earnings.set(key, group); consumed.add(warning);
      continue;
    }
    const shortfallMatch = shortfallPattern.exec(warning);
    if (shortfallMatch) {
      shortfalls.push({ year: Number(shortfallMatch[1]), amount: shortfallMatch[2], warning }); consumed.add(warning);
    }
  }
  healthcare.forEach((group, baseYear) => output.push({
    message: `Healthcare estimates for ${yearRange(group.years)} are planning projections indexed from ${baseYear} at the healthcare-inflation assumption; they are not official future Medicare premiums.`, sourceWarnings: group.warnings,
  }));
  magi.forEach((group) => output.push({
    message: `No supplied MAGI for ${yearRange(group.lookbacks)}: ${group.person}'s Medicare estimates for ${yearRange(group.estimateYears)} use the standard Part B tier and no Part D IRMAA rather than inventing a two-year lookback.`, sourceWarnings: group.warnings,
  }));
  earnings.forEach(group => output.push({ message: `${group.person}: earnings-test withholding is not modeled for ${yearRange(group.years)}; only annual SSA rules for ${group.base} were supplied.`, sourceWarnings: group.warnings }));
  shortfalls.sort((left, right) => left.year - right.year);
  for (let index = 0; index < shortfalls.length; index += 10) {
    const chunk = shortfalls.slice(index, index + 10);
    output.push({ message: `Reported cash-flow shortfalls (year: amount): ${chunk.map(item => `${item.year}: $${item.amount}`).join('; ')}. Assets were not allowed to become negative.`, sourceWarnings: chunk.map(item => item.warning) });
  }
  unique.filter((warning) => !consumed.has(warning)).forEach((warning) => output.push({ message: warning, sourceWarnings: [warning] }));
  return output;
}

function sourceRows(assumptions: PlanningAssumptions): string[][] {
  // Group only identical citations, retaining every saved source key in the group.
  // This preserves complete source metadata without making a Letter appendix unreadable.
  const sources = [...assumptions.annual.sources, ...assumptions.sources];
  if (!sources.length) return [];
  const grouped = new Map<string, { keys: string[]; title: string; classification: string; verifiedAt: string; url: string; note: string }>();
  for (const source of sources) {
    const note = source.note ?? '';
    const signature = [source.title, source.classification, source.verifiedAt, source.url, note].join('\u0000');
    const existing = grouped.get(signature);
    if (existing) existing.keys.push(source.key);
    else grouped.set(signature, { keys: [source.key], title: source.title, classification: source.classification, verifiedAt: source.verifiedAt, url: source.url, note });
  }
  return [...grouped.values()].map((source) => [
    escapeHtml(source.keys.join(', ')), escapeHtml(source.title), escapeHtml(source.classification), escapeHtml(source.verifiedAt), escapeHtml(source.url), escapeHtml(source.note || '—'),
  ]);
}

function sourceCards(rows: string[][]): string {
  if (!rows.length) return '<p class="missing">No source records were supplied in this assumptions snapshot.</p>';
  return `<div class="source-grid">${rows.map(([keys, title, classification, verifiedAt, url, note]) => `<article class="source-card"><strong>${title}</strong><span>${classification} · verified ${verifiedAt}</span><span><b>Keys:</b> ${keys}</span><span class="source-url">${url}</span>${note === '—' ? '' : `<span><b>Note:</b> ${note}</span>`}</article>`).join('')}</div>`;
}

function disclosuresPages(input: ReportRenderInput, results: Record<string, unknown>): Page[] {
  const sources = sourceRows(input.assumptions);
  const sourceRecordCount = input.assumptions.annual.sources.length + input.assumptions.sources.length;
  const checksum = input.checksum || firstText(input, ['analysisChecksum']) || 'Not supplied';
  const engineWarnings = [...input.input.warnings, ...Object.values(results).flatMap((value) => warningsFor(record(value)))].filter((value, index, all) => all.indexOf(value) === index);
  const warningSummaries = summarizeReportWarnings(engineWarnings);
  const brandingDisclosure = input.branding.disclosure.trim();
  const additionalDisclosure = brandingDisclosure.startsWith(REPORT_FULL_DISCLAIMER)
    ? brandingDisclosure.slice(REPORT_FULL_DISCLAIMER.length).trim()
    : brandingDisclosure;
  const warningAppendix = warningSummaries.length
    ? `<aside class="warning warning-appendix"><strong>Saved analysis warnings (${engineWarnings.length} source warnings consolidated into ${warningSummaries.length} visible items):</strong><ul>${warningSummaries.map((summary) => `<li>${escapeHtml(summary.message)}</li>`).join('')}</ul></aside>`
    : '<p class="note">No saved engine warnings were present in this report snapshot.</p>';
  return [page('Assumptions & source citations', 'assumptions-sources', `<p class="lede">This report is tied to a saved input, assumptions, and results snapshot. It does not update automatically after generation.</p><div class="two-column"><section><h2>Snapshot lineage</h2>${table(['Item', 'Value'], [['Scenario', escapeHtml(input.scenarioName || 'Not supplied')], ['Report version', escapeHtml(String(input.version))], ['Generated', escapeHtml(formatDate(input.generatedAt))], ['Assumptions version', escapeHtml(input.assumptions.version || 'Not supplied')], ['Rules year', escapeHtml(String(input.assumptions.year))], ['Checksum', escapeHtml(checksum)]], true)}</section><section><h2>Planning assumptions</h2>${table(['Assumption', 'Value'], [['General inflation', percentCell(input.assumptions.inflation, 'FRACTION')], ['Healthcare inflation', percentCell(input.assumptions.healthcareInflation, 'FRACTION')], ['Social Security COLA', percentCell(input.assumptions.socialSecurityCola, 'FRACTION')], ['Monte Carlo target', percentCell(input.assumptions.monteCarloTarget, 'FRACTION')], ['Monte Carlo runs', escapeHtml(formatPlainNumber(input.assumptions.monteCarloRuns))], ['Monte Carlo seed', escapeHtml(String(input.assumptions.monteCarloSeed))]].map((row) => row.map(escapeHtml)), true)}</section></div><h2>Annual and planning source records</h2><p class="note source-summary">${sourceRecordCount} saved annual/planning source records are represented by ${sources.length} full citations below; every source key is retained. Classifications identify OFFICIAL, PROJECTED, or PLANNING_ASSUMPTION inputs.</p>${sourceCards(sources)}`), page('Model limitations & disclosures', 'assumptions-disclosures', `<p class="lede">Every model warning is preserved below, with repetitive annual warnings consolidated into explicit year ranges. Full source citations and saved assumptions are on the preceding page.</p><h2>Model limitations and disclosures</h2><p>${escapeHtml(REPORT_FULL_DISCLAIMER)}</p><p>Monte Carlo simulations use the saved model inputs, return assumptions, and seeded results. Simulations cannot capture every risk, market condition, tax-law change, spending decision, longevity outcome, or future insurance availability.</p>${additionalDisclosure ? `<h3>Additional advisor disclosure</h3><p>${textWithBreaks(additionalDisclosure)}</p>` : ''}${warningAppendix}<div class="signature"><span>Advisor signature</span><strong>${escapeHtml(input.branding.advisorName || 'Not supplied')}</strong><span>License numbers: ${escapeHtml(input.branding.licenseNumbers || 'Not supplied')}</span></div>`)];
}

function advisorLetterPage(input: ReportRenderInput): Page {
  const letter = input.branding.letterApproved && input.branding.letter.trim()
    ? `<div class="letter">${textWithBreaks(input.branding.letter)}</div>`
    : '<p class="warning"><strong>Advisor letter unavailable:</strong> no approved advisor letter was supplied for this report.</p>';
  const contents = REPORT_SECTION_OPTIONS.filter((option) => selectedSections(input).has(option.id)).map((option) => `<li>${escapeHtml(option.label)}</li>`).join('');
  return page('Advisor letter & contents', 'advisor-letter', `<div class="two-column"><section><h2>Advisor letter</h2>${letter}</section><section><h2>Contents</h2><ol class="contents"><li>Cover</li>${contents}</ol><h2>Report note</h2><p>${textWithBreaks(input.coverNote || 'No cover note was supplied.')}</p></section></div>`);
}

function reportClientTitle(input: ReportRenderInput): string {
  const primary = input.input.persons.find((person) => person.role === 'PRIMARY');
  const spouse = input.input.persons.find((person) => person.role === 'SPOUSE');
  const primaryName = primary?.name || input.input.clientName || input.clientName;
  return spouse?.name ? `${primaryName} & ${spouse.name}` : primaryName;
}

function coverPage(input: ReportRenderInput, results: Record<string, unknown>): Page {
  const readiness = moduleResult(results, ['readiness']);
  const score = firstNumber(readiness, ['score']);
  const clientTitle = reportClientTitle(input);
  const logo = safeLogo(input.branding.logoDataUrl);
  const contact = [input.branding.advisorEmail, input.branding.advisorPhone].filter((item): item is string => Boolean(item)).join(' · ');
  return { id: 'cover', title: 'Cover', cover: true, body: `<div class="cover-main"><div class="cover-logo">${logo || '<span>LSRT</span>'}<strong>Insurance</strong></div><p class="eyebrow">${escapeHtml(input.branding.coverText || 'Your Retirement, Expertly Planned')}</p><h1>Retirement Plan for<br>${escapeHtml(clientTitle || 'Client')}</h1><p class="cover-date">Prepared ${escapeHtml(formatDate(input.generatedAt))}</p><div class="cover-score">${score === null ? '<span class="score-na">Readiness score<br>not available</span>' : renderGaugeSvg(score, { title: 'Retirement readiness score', max: 100 })}</div><p class="cover-note">${textWithBreaks(input.coverNote || '')}</p></div><div class="cover-advisor"><strong>${escapeHtml(input.branding.advisorName || 'Advisor')}</strong><span>${escapeHtml(contact || 'Contact information not supplied')}</span><span>Scenario: ${escapeHtml(input.scenarioName || 'Not supplied')}</span></div>` };
}

function reportPages(input: ReportRenderInput): Page[] {
  const sections = selectedSections(input);
  const results = input.results;
  const pages: Page[] = [coverPage(input, results)];
  if (include(sections, 'advisor-letter')) pages.push(advisorLetterPage(input));
  if (include(sections, 'executive-summary')) pages.push(executivePage(input, results));
  if (include(sections, 'your-information')) pages.push(informationPage(input));
  if (include(sections, 'net-worth')) pages.push(netWorthPage(input, results));
  if (include(sections, 'social-security')) pages.push(...socialSecurityPages(input, results));
  if (include(sections, 'retirement-income')) pages.push(...retirementIncomePages(results));
  if (include(sections, 'monte-carlo')) pages.push(monteCarloPage(input, results));
  if (include(sections, 'withdrawal-strategy')) pages.push(withdrawalsPage(results));
  if (include(sections, 'tax-plan')) pages.push(...taxPages(input, results));
  if (include(sections, 'rmds')) pages.push(rmdPage(input, results));
  if (include(sections, 'healthcare-medicare')) pages.push(healthcarePage(results));
  if (include(sections, 'long-term-care')) pages.push(ltcPage(results));
  if (include(sections, 'investments')) pages.push(investmentsPage(results));
  if (include(sections, 'protection-estate')) pages.push(protectionEstatePage(input, results));
  const comparison = scenarioComparisonPage(input as AdvisorReportInput);
  if (comparison) pages.push(comparison);
  if (include(sections, 'action-plan')) pages.push(...actionPlanPages(input));
  if (include(sections, 'glossary')) pages.push(glossaryPage());
  if (include(sections, 'assumptions-disclosures')) pages.push(...disclosuresPages(input, results));
  return attachApprovedNarrative(pages, input as AdvisorReportInput);
}

function pageHtml(pageData: Page, pageNumber: number, pageCount: number, input: ReportRenderInput): string {
  const logo = safeLogo(input.branding.logoDataUrl);
  const header = pageData.cover ? '' : `<header class="page-header">${logo || '<span class="wordmark">LSRT Insurance</span>'}<span>${escapeHtml(pageData.title)}</span></header>`;
  const footer = `<footer class="page-footer"><span>Prepared by ${escapeHtml(input.branding.advisorName || 'Advisor')}, LSRT Insurance · ${escapeHtml(formatDate(input.generatedAt))}</span><span>${escapeHtml(REPORT_FOOTER_DISCLAIMER)}</span><strong>Page ${pageNumber} of ${pageCount}</strong></footer>`;
  return `<section class="page ${pageData.cover ? 'cover' : ''}" data-section="${escapeHtml(pageData.id)}">${header}<main class="page-main">${pageData.body}</main>${footer}</section>`;
}

function reportCss(): string {
  return `${fontCss()}@page{size:Letter portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#080A0E;color:#F6F7FB;font-family:ReportDMSans,Arial,sans-serif}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.page{width:8.5in;height:11in;position:relative;overflow:hidden;break-after:page;background:#080A0E;padding:.45in .5in .7in}.page:last-child{break-after:auto}.page-header{height:.36in;margin:-.45in -.5in .22in;padding:.1in .5in;display:flex;align-items:center;justify-content:space-between;background:#0D1016;border-top:3px solid ${REPORT_BLUE};color:#F6F7FB;font:700 10px ReportManrope,Arial,sans-serif;letter-spacing:.03em}.wordmark{color:${REPORT_LIGHT_BLUE}}.brand-logo{max-height:22px;max-width:110px;object-fit:contain}.page-main{position:relative}.page-footer{position:absolute;left:.5in;right:.5in;bottom:.22in;border-top:1px solid #2A3440;padding-top:6px;display:grid;grid-template-columns:1.2fr 2.4fr .7fr;gap:8px;color:#929AA8;font-size:7px;line-height:1.2}.page-footer strong{text-align:right;color:#F6F7FB;white-space:nowrap}h1,h2,h3{font-family:ReportManrope,Arial,sans-serif;margin:0;color:#F6F7FB}h1{font-size:31px;line-height:1.12;letter-spacing:-.025em}h2{font-size:17px;line-height:1.2;margin:0 0 9px}h3{font-size:12px;margin:0 0 4px}p{font-size:10.2px;line-height:1.46;margin:0 0 9px}.lede{color:#DDEBFC;font-size:11px;border-left:3px solid ${REPORT_BLUE};padding-left:10px;margin-bottom:14px}.note,.missing{color:#B6C0CE;font-size:9px}.warning{background:#1D1720;border-left:3px solid #C77700;padding:8px 10px;margin:10px 0;color:#FFE7B0;font-size:9px;line-height:1.35}.warning ul{margin:5px 0 0;padding-left:16px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0 14px}.compact-metrics{grid-template-columns:repeat(2,1fr)}.metric{min-height:54px;background:#0D1016;border:1px solid #263445;border-radius:7px;padding:8px}.metric span{display:block;color:#929AA8;font-size:8px;line-height:1.25;margin-bottom:5px}.metric strong{display:block;color:#F6F7FB;font-family:ReportManrope,Arial,sans-serif;font-size:12px;line-height:1.15;overflow-wrap:anywhere}.two-column{display:grid;grid-template-columns:1fr 1fr;gap:16px}.four-column{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.callout{background:#0D1016;border:1px solid #263445;border-top:3px solid ${REPORT_BLUE};border-radius:5px;padding:8px;font-size:8.5px;line-height:1.35}.callout strong,.callout span{display:block}.callout span{margin-top:4px;color:#B6C0CE}.table-wrap{width:100%;overflow:hidden;margin:6px 0 10px}table{width:100%;border-collapse:collapse;font-size:8.5px;line-height:1.2;table-layout:auto}th{background:#14243A;color:${REPORT_LIGHT_BLUE};font:700 7.5px ReportManrope,Arial,sans-serif;text-transform:uppercase;letter-spacing:.03em}th,td{padding:5px 5px;border-bottom:1px solid #263445;vertical-align:top;overflow-wrap:anywhere}td{color:#F6F7FB}tbody tr:nth-child(even){background:#0D1016}table.compact th,table.compact td{padding:3.5px 4px;font-size:7.8px}.report-chart{display:block;width:100%;height:auto;max-height:2.8in;margin:6px 0}.traffic-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}.traffic{border-radius:5px;padding:7px;font-size:9px;border:1px solid #263445;background:#0D1016}.traffic strong,.traffic span{display:block}.traffic span{font-size:8px;margin-top:3px}.traffic.green{border-left:3px solid #2E7D32}.traffic.amber{border-left:3px solid #C77700}.traffic.red{border-left:3px solid #B3261E}.traffic.gray{border-left:3px solid #677384}.actions{margin:3px 0;padding-left:17px;font-size:9px;line-height:1.35}.actions li{margin-bottom:7px}.actions span{color:#B6C0CE}.letter{font-size:10px;line-height:1.55;white-space:normal}.contents{font-size:10px;line-height:1.6;margin:0;padding-left:19px}.recommendation{display:grid;grid-template-columns:20px 1fr;gap:8px;padding:9px 0;border-bottom:1px solid #263445}.checkbox{font-size:19px;color:${REPORT_LIGHT_BLUE}}.recommendation p{font-size:9px;margin:2px 0 5px}.recommendation dl{margin:0;display:grid;grid-template-columns:70px 1fr;gap:2px 6px;font-size:8px;color:#B6C0CE}.recommendation dt{font-weight:700;color:#929AA8}.recommendation dd{margin:0}.priority{font-size:7px;font-weight:700;letter-spacing:.08em}.priority.high{color:#FF8A80}.priority.medium{color:#FFD180}.priority.low{color:#9EE7B4}.signature{margin-top:13px;border-top:1px solid #2A3440;padding-top:11px;display:flex;flex-direction:column;gap:4px;font-size:9px;color:#929AA8}.signature strong{color:#F6F7FB;font-size:12px}.cover{padding:.55in .6in .75in;background:linear-gradient(145deg,#080A0E 0%,#0D1F35 65%,#071725 100%);border:9px solid ${REPORT_BLUE}}.cover-main{height:8.4in;position:relative}.cover-logo{display:flex;align-items:center;gap:7px;color:#F6F7FB;font:700 18px ReportManrope,Arial,sans-serif}.cover-logo .brand-logo{max-height:38px;max-width:145px}.cover-logo span{display:inline-block;background:${REPORT_BLUE};padding:5px 7px;color:#080A0E;font-weight:800;letter-spacing:.04em}.eyebrow{margin-top:.85in;color:${REPORT_LIGHT_BLUE};font:700 10px ReportManrope,Arial,sans-serif;text-transform:uppercase;letter-spacing:.13em}.cover h1{margin-top:.15in;max-width:5.9in;font-size:35px}.cover-date{margin-top:.2in;color:#B6C0CE;font-size:12px}.cover-score{position:absolute;right:0;bottom:.5in;width:2.6in}.cover-score .report-chart{margin:0}.score-na{display:block;border:1px solid #526273;border-radius:9px;padding:28px 12px;text-align:center;color:#D6DEEA;font:700 14px ReportManrope,Arial,sans-serif}.cover-note{position:absolute;left:0;bottom:.3in;max-width:4.4in;color:#DDEBFC;font-size:11px}.cover-advisor{display:flex;flex-direction:column;gap:4px;color:#DDEBFC;font-size:9px}.cover-advisor strong{font:700 12px ReportManrope,Arial,sans-serif;color:#F6F7FB}.cover .page-footer{left:.6in;right:.6in;bottom:.24in}.cover .page-main{height:9.4in}@media print{.page{break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}}`;
}

/** Targeted compaction preserves full snapshot warnings and citations on the 22-page Letter default. */
function reportCssOverrides(): string {
  return `.warning-summary{padding:6px 8px;margin:7px 0;font-size:8.5px;line-height:1.25}.source-summary{font-size:8.5px;line-height:1.25;margin:3px 0 5px}.page[data-section^="assumptions-"] h2{font-size:13px;margin-bottom:5px}.page[data-section^="assumptions-"] h3{font-size:10px}.page[data-section^="assumptions-"] p{font-size:8.5px;line-height:1.28;margin-bottom:5px}.page[data-section^="assumptions-"] .table-wrap{margin:3px 0 5px}.page[data-section^="assumptions-"] table{font-size:7.8px;line-height:1.14}.page[data-section^="assumptions-"] th{font-size:7px}.page[data-section^="assumptions-"] th,.page[data-section^="assumptions-"] td{padding:2.5px 3px}.source-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:3px 0 6px}.source-card{display:flex;flex-direction:column;gap:1px;border:1px solid #263445;border-left:2px solid #168CFF;padding:4px 5px;font-size:9px;line-height:1.25;overflow-wrap:anywhere}.source-card strong{font-size:9.5px;color:#F6F7FB}.source-card span{color:#B6C0CE}.source-card .source-url{color:#47B5FF}.warning-appendix{padding:7px 9px;margin:7px 0;font-size:9px;line-height:1.28}.warning-appendix ul{columns:3;column-gap:10px;margin-top:3px;padding-left:12px}.warning-appendix li{break-inside:avoid;margin-bottom:2px}.page[data-section^="assumptions-"] .signature{margin-top:6px;padding-top:5px;gap:2px;font-size:8px}.page[data-section^="assumptions-"] .signature strong{font-size:10px}.cover-main{height:8in}.cover .page-main{height:auto}`;
}

/** Render the selected saved-analysis sections into a self-contained, escaped Letter-report HTML document. */
export function renderReportHtml(input: ReportRenderInput): string {
  const pages = reportPages(input);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(`Retirement plan for ${reportClientTitle(input)}`)}</title><style>${reportCss()}${reportCssOverrides()}.approved-narrative{border-left:3px solid #168CFF;padding:8px 10px;margin:8px 0 12px;background:#0D1016}.approved-narrative h2{font-size:12px}.approved-narrative p{font-size:10px;line-height:1.4}</style></head>
<body>${pages.map((item, index) => pageHtml(item, index + 1, pages.length, input)).join('')}</body></html>`;
}

/**
 * Production must explicitly set CHROMIUM_EXECUTABLE_PATH. The development
 * default is intentionally visible in the returned status rather than silently
 * assuming a production host contains Chromium.
 */
export function getReportPdfRuntimeStatus(): ReportPdfRuntimeStatus {
  const configured = Boolean(process.env.CHROMIUM_EXECUTABLE_PATH);
  return {
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
    configuredByEnvironment: configured,
    productionUnavailable: process.env.NODE_ENV === 'production' && !configured,
  };
}

/** Reject a report whose fixed Letter page would hide content beneath its footer. */
async function assertReportLayoutFits(page: any): Promise<void> {
  const overflows = await page.evaluate(() => {
    const result: Array<{ id: string; reason: string; overflowPixels: number | null }> = [];
    Array.from(document.querySelectorAll<HTMLElement>('.page')).forEach((sheet) => {
    const main = sheet.querySelector<HTMLElement>('.page-main');
    const footer = sheet.querySelector<HTMLElement>('.page-footer');
    if (!main || !footer) {
      result.push({ id: sheet.dataset.section || 'unknown', reason: 'missing page main or footer', overflowPixels: null });
      return;
    }
    const footerTop = footer.getBoundingClientRect().top;
    const contentBottom = [main, ...Array.from(main.querySelectorAll<HTMLElement>('*'))]
      .filter((element) => getComputedStyle(element).display !== 'none')
      .reduce((bottom, element) => Math.max(bottom, element.getBoundingClientRect().bottom), main.getBoundingClientRect().bottom);
    if (contentBottom > footerTop - 2) result.push({ id: sheet.dataset.section || 'unknown', reason: 'content reached the fixed footer', overflowPixels: Math.ceil(contentBottom - footerTop) });
    });
    return result;
  });
  if (overflows.length) throw new Error(`REPORT_LAYOUT_OVERFLOW: ${JSON.stringify(overflows)}`);
}

/** Generate a Letter PDF with local/data-url assets only; all outgoing requests are blocked. */
export async function renderReportPdf(input: ReportRenderInput): Promise<Buffer> {
  const runtime = getReportPdfRuntimeStatus();
  if (runtime.productionUnavailable) {
    throw new ReportPdfRuntimeError('PDF rendering is unavailable in production until CHROMIUM_EXECUTABLE_PATH is configured.');
  }

  let browser: { newPage: () => Promise<any>; close: () => Promise<void> } | undefined;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true, executablePath: runtime.executablePath });
    const page = await browser.newPage();
    await page.route('**/*', (route: { abort: (errorCode?: string) => Promise<void> }) => route.abort('blockedbyclient'));
    await page.setContent(renderReportHtml(input), { waitUntil: 'load' });
    await page.evaluate(async () => { await document.fonts?.ready; });
    await page.evaluate(() => {
      for (const sheet of Array.from(document.querySelectorAll<HTMLElement>('.page'))) {
        const note = sheet.querySelector<HTMLElement>('.approved-narrative');
        const main = sheet.querySelector<HTMLElement>('.page-main');
        const footer = sheet.querySelector<HTMLElement>('.page-footer');
        if (!note || !main || !footer) continue;
        const bottom = Math.max(main.getBoundingClientRect().bottom, ...Array.from(main.querySelectorAll<HTMLElement>('*')).map(e => e.getBoundingClientRect().bottom));
        if (bottom <= footer.getBoundingClientRect().top - 2) continue;
        const continuation = sheet.cloneNode(true) as HTMLElement;
        continuation.dataset.section = (sheet.dataset.section || 'section') + '-approved-explanation';
        const continuedMain = continuation.querySelector<HTMLElement>('.page-main')!;
        const heading = document.createElement('h1'); heading.textContent = 'Advisor-reviewed explanation';
        continuedMain.replaceChildren(heading, note);
        const headerTitle = continuation.querySelector<HTMLElement>('.page-header > span:last-child');
        if (headerTitle) headerTitle.textContent = 'Advisor-reviewed explanation — continued';
        sheet.after(continuation);
      }
      const sheets = Array.from(document.querySelectorAll<HTMLElement>('.page'));
      sheets.forEach((sheet, index) => { const label = sheet.querySelector<HTMLElement>('.page-footer strong'); if (label) label.textContent = `Page ${index + 1} of ${sheets.length}`; });
    });
    await assertReportLayoutFits(page);
    const bytes: Uint8Array = await page.pdf({
      format: 'Letter', printBackground: true, preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.from(bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Chromium failure.';
    if (/executable|browserType\.launch|ENOENT|not found/i.test(message)) {
      throw new ReportPdfRuntimeError(`PDF rendering runtime unavailable at ${runtime.executablePath}: ${message}`);
    }
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}
