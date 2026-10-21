import { narrativeContentSchema, NARRATIVE_SECTION_IDS, type NarrativeContent, type NarrativeValidation, type NarrativeValidationContext } from './types';

const DECIMAL_MARKER = '\uE000';
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const SLASH_DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
const HUMAN_DATE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/gi;
const NUMBER_TOKEN = /(?<![A-Za-z0-9_])(?:\$\s*)?[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?(?![A-Za-z0-9_])/g;

type NumberToken = { raw: string; value: number; decimals: number; percent: boolean };
type FactRegistry = { numbers: number[]; dates: Set<string> };

function finiteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

/** All finite output values (not input, DOB, uploads, or contact data) are acceptable source values. */
function collectFacts(value: unknown, registry: FactRegistry, includeDates: boolean): void {
  if (finiteNumber(value)) { registry.numbers.push(value); return; }
  if (typeof value === 'string') {
    if (includeDates && /^\d{4}-\d{2}-\d{2}(?:T[^\s]+)?$/.test(value)) registry.dates.add(value.slice(0, 10));
    return;
  }
  if (Array.isArray(value)) { value.forEach((item) => collectFacts(item, registry, includeDates)); return; }
  if (record(value)) Object.values(value).forEach((item) => collectFacts(item, registry, includeDates));
}

function collectNumbersFromText(text: string, registry: FactRegistry): void {
  for (const match of text.matchAll(NUMBER_TOKEN)) {
    const numeric = Number(match[0].replace(/[$,\s]/g, '').replace(/%$/, ''));
    if (Number.isFinite(numeric)) registry.numbers.push(numeric);
  }
}

function sourceFacts(context: NarrativeValidationContext): FactRegistry {
  const registry: FactRegistry = { numbers: [], dates: new Set<string>() };
  collectFacts(context.results, registry, true);
  // Captured analysis metadata may contain a source date; intake/DOB deliberately is never added.
  collectFacts(context.analysisMeta, registry, true);
  // Approved recommendations are explicitly allowed narrative facts. Their text still does not bypass safety checks.
  collectFacts(context.approvedRecommendations, registry, true);
  for (const recommendation of context.approvedRecommendations) {
    for (const value of [recommendation.title, recommendation.body, recommendation.nextStep, recommendation.owner, recommendation.targetDate, recommendation.dollarImpact, recommendation.impactLabel]) {
      if (typeof value === 'string') collectNumbersFromText(value, registry);
    }
  }
  return registry;
}

function numberTokens(text: string, dates: Set<string>): { tokens: NumberToken[]; unsupportedDates: string[] } {
  const unsupportedDates: string[] = [];
  const hideDate = (whole: string, normalized: string) => {
    if (!dates.has(normalized)) unsupportedDates.push(whole);
    return ' '.repeat(whole.length);
  };
  const withoutIsoDates = text.replace(ISO_DATE, (whole) => hideDate(whole, whole));
  const withoutSlashDates = withoutIsoDates.replace(SLASH_DATE, (whole, month: string, day: string, year: string) => {
    const normalized = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    return hideDate(whole, normalized);
  });
  const withoutDates = withoutSlashDates.replace(HUMAN_DATE, (whole, monthName: string, day: string, year: string) => {
    const month = new Date(`${monthName} 1, ${year} UTC`).getUTCMonth() + 1;
    const normalized = Number.isFinite(month) ? `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}` : '';
    return hideDate(whole, normalized);
  });
  const tokens: NumberToken[] = [];
  for (const match of withoutDates.matchAll(NUMBER_TOKEN)) {
    const raw = match[0];
    const normalized = raw.replace(/[$,\s]/g, '').replace(/%$/, '');
    const value = Number(normalized);
    if (!Number.isFinite(value)) continue;
    const decimalMatch = /\.(\d+)/.exec(normalized);
    tokens.push({ raw, value, decimals: decimalMatch?.[1].length ?? 0, percent: raw.trim().endsWith('%') });
  }
  return { tokens, unsupportedDates };
}

function displayedEquals(source: number, token: NumberToken): boolean {
  const expected = token.percent ? [source * 100, source] : [source];
  const roundingAllowance = token.decimals === 0 ? 0.500_000_1 : 0.5 * 10 ** -Math.min(token.decimals, 6) + 0.000_000_1;
  return expected.some((candidate) => Math.abs(candidate - token.value) <= roundingAllowance);
}

export function unsupportedNarrativeNumbers(text: string, context: NarrativeValidationContext): string[] {
  const registry = sourceFacts(context);
  const parsed = numberTokens(text, registry.dates);
  const unsupported = [...parsed.unsupportedDates];
  for (const token of parsed.tokens) {
    if (!registry.numbers.some((source) => displayedEquals(source, token))) unsupported.push(token.raw);
  }
  return [...new Set(unsupported)];
}

function sentenceCount(text: string): number {
  const masked = text.replace(/(?<=\d)\.(?=\d)/g, DECIMAL_MARKER).trim();
  return (masked.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? []).map((part) => part.trim()).filter(Boolean).length;
}

/** Reject outcome guarantees while preserving the required 'not guarantees' disclosure language. */
export function unsafeNarrativeClaims(text: string): string[] {
  const checks: Array<[RegExp, string]> = [
    [/\b(?:will|can)\s+(?:guarantee|ensure|eliminate|avoid)\b/i, 'guaranteed outcome language'],
    [/\bguaranteed?\s+(?:income|return|outcome|result|growth|payment|coverage)\b/i, 'guaranteed financial claim'],
    [/\b(?:risk[- ]free|no[- ]risk)\b/i, 'risk-free claim'],
    [/\bwill\s+(?:last|meet|achieve|provide|cover)\b/i, 'promised financial outcome'],
    [/\b(?:tax[- ]free|legal advice|tax advice)\b/i, 'unsupported tax or legal claim'],
  ];
  return checks.filter(([pattern]) => pattern.test(text)).map(([, reason]) => reason);
}

export function wordCount(text: string): number {
  return (text.trim().match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) ?? []).length;
}

export function validateNarrativeContent(raw: unknown, context: NarrativeValidationContext): NarrativeValidation {
  const parsed = narrativeContentSchema.safeParse(raw);
  if (!parsed.success) return { valid: false, errors: ['Narrative content has an invalid shape or exceeds its safe length.'], unsupportedNumbers: [] };
  const content: NarrativeContent = parsed.data;
  const errors: string[] = [];
  const numbers = unsupportedNarrativeNumbers(`${content.letter}\n${Object.values(content.sections).join('\n')}`, context);
  const claims = unsafeNarrativeClaims(`${content.letter}\n${Object.values(content.sections).join('\n')}`);
  const words = wordCount(content.letter);
  if (words < 150 || words > 250) errors.push('The advisor letter must contain 150 to 250 words.');
  const expected = new Set<string>(NARRATIVE_SECTION_IDS);
  const received = Object.keys(content.sections);
  if (received.length !== NARRATIVE_SECTION_IDS.length || received.some((id) => !expected.has(id))) errors.push('Narrative sections must match the supported report sections.');
  for (const id of NARRATIVE_SECTION_IDS) {
    const section = content.sections[id];
    if (!section) { errors.push(`The ${id} section is required.`); continue; }
    const count = sentenceCount(section);
    if (count < 2 || count > 3) errors.push(`The ${id} section must contain 2 to 3 sentences.`);
  }
  if (numbers.length) errors.push('Every numeric claim must match a saved analysis result or approved recommendation.');
  if (claims.length) errors.push('Narrative text cannot make guarantees or unsupported tax/legal claims.');
  return errors.length ? { valid: false, errors, unsupportedNumbers: numbers } : { valid: true, content };
}
