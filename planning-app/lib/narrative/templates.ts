import { finiteAt, money, narrativeFacts, percent, points, recordAt, recordsAt, retirementRow, safeFirstName, textForFact } from './facts';
import { NARRATIVE_SECTION_IDS, type NarrativeContent, type NarrativeTemplateContext } from './types';
import { unsafeNarrativeClaims, validateNarrativeContent, wordCount } from './validation';

function joinNatural(values: string[]): string {
  if (!values.length) return 'the priorities you shared';
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

function firstSafeTitle(context: NarrativeTemplateContext): string | null {
  return context.approvedRecommendations.map((item) => item.title.replace(/\s+/g, ' ').trim()).find((title) => title && !unsafeNarrativeClaims(title).length) ?? null;
}

function firstFactSentence(context: NarrativeTemplateContext): string {
  const facts = narrativeFacts(context.results);
  const preferred = ['net-worth', 'retirement-assets', 'monte-carlo-success', 'readiness-score'];
  const selected = preferred.map((id) => facts.find((fact) => fact.id === id)).filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
  if (!selected.length) return 'The saved calculation has limited complete output, so the report keeps its assumptions and data limits visible for review.';
  return selected.slice(0, 3).map((fact) => `${fact.label} is ${fact.value}`).join('; ') + '.';
}

function normalizedLetter(context: NarrativeTemplateContext): string {
  const firstName = safeFirstName(context.firstName);
  const scenarioName = context.scenarioName.replace(/[0-9$%]/g, '').replace(/\s+/g, ' ').trim() || 'saved';
  const concerns = joinNatural(context.concerns.slice(0, 3));
  const title = firstSafeTitle(context);
  const planSentence = title
    ? `One approved action for discussion is “${title}.”`
    : 'The approved action plan is retained for your review before any action is taken.';
  const output = `Hello ${firstName},

This letter summarizes the saved ${scenarioName} calculation for your review. It organizes the planning choices discussed in this analysis; it does not predict or promise a particular outcome. Your stated priorities include ${concerns}, and we will use those priorities to guide our next conversation.

${firstFactSentence(context)} These are modeled outputs based on the saved inputs and assumptions. Please review them alongside the data limits and disclosures in the report, especially before any action is taken. ${planSentence} We can revisit the timing, trade-offs, and questions behind the approved items together.

For tax or legal matters, please discuss the details with your tax professional or attorney. This report is educational and illustrative. Projections are hypothetical and are not guarantees. We will keep the facts, assumptions, and open questions visible as we review next steps together.

Sincerely,
Your advisor`;
  return output;
}

function genericSection(subject: string): string {
  return `The ${subject} discussion uses only the saved calculation outputs available in this analysis. Review the displayed assumptions, warnings, and data limits with your advisor before acting.`;
}

function detailOrGeneric(subject: string, details: string[]): string {
  const valid = details.filter(Boolean);
  if (!valid.length) return genericSection(subject);
  return `${valid.join(' ')} The result is a planning illustration based on the saved inputs and assumptions, not a promise of an outcome.`;
}

function sectionsFor(context: NarrativeTemplateContext): Record<string, string> {
  const r = context.results;
  const retirement = retirementRow(r);
  const facts = narrativeFacts(r);
  const fact = (id: string) => facts.find((item) => item.id === id)?.value ?? null;
  const social = recordAt(r, 'socialSecurity.planned');
  const tax = recordAt(r, 'taxes.current');
  const allocation = recordAt(r, 'allocation.target');
  const ltc = recordAt(r, 'ltc');
  const estate = recordAt(r, 'estate');
  const title = firstSafeTitle(context);
  const rows = recordsAt(r, 'cashFlow.rows');
  const rmdRows = rows.filter((row) => typeof row.rmd === 'number' && row.rmd > 0);
  const amounts = {
    netWorth: fact('net-worth'), investable: fact('investable-assets'), retirement: fact('retirement-assets'), income: fact('income-coverage'),
    success: fact('monte-carlo-success'), median: fact('monte-carlo-median'), readiness: fact('readiness-score'), tax: fact('current-federal-tax'),
    lifetimeTax: fact('lifetime-federal-tax'), healthcare: fact('healthcare-lifetime'), hsa: fact('hsa-years'), ltc: fact('ltc-cost'), ltcGap: fact('ltc-gap'), insurance: fact('insurance-need'), equity: fact('target-equity'), rmd: fact('rmd-total'),
  };
  const portfolioNeed = textForFact(retirement, 'portfolioNeed', money);
  const endingLegacy = textForFact(retirement, 'endingBalance', money);
  const plannedBenefits = textForFact(social, 'presentValue', money);
  const rothTaxDifference = fact('roth-tax-difference');
  const rmdFirst = textForFact(rmdRows[0] ?? null, 'rmd', money);
  const coverage = textForFact(ltc, 'existingCoverage', money);
  const estateFlag = typeof estate?.estateTaxFlag === 'object' && estate.estateTaxFlag && 'status' in estate.estateTaxFlag ? String((estate.estateTaxFlag as Record<string, unknown>).status).replaceAll('_', ' ').toLowerCase() : '';
  const sections: Record<string, string> = {
    'executive-summary': detailOrGeneric('executive summary', [
      amounts.readiness ? `The saved readiness score is ${amounts.readiness}.` : '',
      amounts.success ? `The saved Monte Carlo success result is ${amounts.success}.` : '',
    ]),
    'net-worth': detailOrGeneric('net worth and tax buckets', [
      amounts.netWorth ? `The calculation reports net worth of ${amounts.netWorth}.` : '',
      amounts.investable ? `Investable assets are shown as ${amounts.investable}.` : '',
    ]),
    'social-security': detailOrGeneric('Social Security', [
      plannedBenefits ? `The planned-strategy present value is ${plannedBenefits}.` : '',
      finiteAt(r, 'socialSecurity.lifetimeDifference') !== null ? `The saved strategy comparison reports a lifetime difference of ${money(finiteAt(r, 'socialSecurity.lifetimeDifference'))}.` : '',
    ]),
    'retirement-income': detailOrGeneric('retirement income plan', [
      amounts.retirement ? `Portfolio assets at the modeled retirement start are ${amounts.retirement}.` : '',
      portfolioNeed ? `The first displayed retirement-row portfolio need is ${portfolioNeed}.` : '',
    ]),
    'monte-carlo': detailOrGeneric('Monte Carlo', [
      amounts.success ? `The saved Monte Carlo success result is ${amounts.success}.` : '',
      amounts.median ? `The modeled median ending value is ${amounts.median}.` : '',
    ]),
    'withdrawal-strategy': detailOrGeneric('withdrawal strategy', [
      portfolioNeed ? `The first displayed retirement-row portfolio need is ${portfolioNeed}.` : '',
      endingLegacy ? `The selected cash-flow row ends with ${endingLegacy}.` : '',
    ]),
    'tax-plan': detailOrGeneric('tax plan and Roth conversions', [
      amounts.tax ? `The current federal tax result is ${amounts.tax}.` : '',
      rothTaxDifference ? `The saved Roth conversion lifetime federal tax difference is ${rothTaxDifference}.` : amounts.lifetimeTax ? `Projected lifetime federal tax is ${amounts.lifetimeTax}.` : '',
    ]),
    'rmds': detailOrGeneric('required minimum distributions', [
      amounts.rmd ? `The saved no-conversion comparison reports total RMDs of ${amounts.rmd}.` : '',
      rmdFirst ? `The first displayed RMD row is ${rmdFirst}.` : '',
    ]),
    'healthcare-medicare': detailOrGeneric('healthcare and Medicare', [
      amounts.healthcare ? `The lifetime future healthcare cost shown in the calculation is ${amounts.healthcare}.` : '',
      amounts.hsa ? `The estimated HSA coverage period is ${amounts.hsa} years.` : '',
    ]),
    'long-term-care': detailOrGeneric('long-term care', [
      amounts.ltc ? `The modeled long-term care cost is ${amounts.ltc}.` : '',
      amounts.ltcGap ? `The displayed coverage gap is ${amounts.ltcGap}.` : coverage ? `The displayed existing coverage is ${coverage}.` : '',
    ]),
    'investments': detailOrGeneric('investments', [
      amounts.equity ? `The saved current target equity is ${amounts.equity}.` : '',
      allocation && typeof allocation.profile === 'string' ? `The saved target profile is ${allocation.profile.toLowerCase()}.` : '',
    ]),
    'protection-estate': detailOrGeneric('protection and estate', [
      amounts.insurance ? `The needs-method insurance gap is ${amounts.insurance}.` : '',
      estateFlag ? `The estate threshold comparison status is ${estateFlag}.` : '',
    ]),
    'action-plan': title
      ? `The approved action plan includes ${title.replace(/[.!?]+$/, '')}. Review the item with your advisor before taking action.`
      : 'No approved action item is included in this narrative draft. Review proposed actions with your advisor before taking action.',
  };
  return sections;
}

function addNeutralWords(letter: string): string {
  const filler = ' This review remains a conversation about the saved facts, their limitations, and the choices that deserve your attention.';
  let completed = letter;
  while (wordCount(completed) < 150) completed = completed.replace('\n\nSincerely,', `${filler}\n\nSincerely,`);
  return completed;
}

export function generateTemplateNarrative(context: NarrativeTemplateContext): NarrativeContent {
  const letter = addNeutralWords(normalizedLetter(context));
  return { letter, sections: sectionsFor(context), mode: 'TEMPLATE' };
}

/** A final deterministic fallback when malformed result values make a numeric template invalid. */
export function generateFallbackNarrative(context: NarrativeTemplateContext): NarrativeContent {
  const scenarioName = context.scenarioName.replace(/[0-9$%]/g, '').replace(/\s+/g, ' ').trim() || 'saved';
  const letter = addNeutralWords(`Hello ${safeFirstName(context.firstName)},

This letter summarizes the saved ${scenarioName} analysis for your review. It organizes the planning information that is available and identifies where assumptions or incomplete data need discussion. Your stated priorities include ${joinNatural(context.concerns.slice(0, 3))}, and we will keep them central to the next conversation.

Some calculation outputs could not be used in the narrative draft because they need review. The report retains the saved assumptions, warnings, and disclosures so that nothing unavailable is represented as zero or as a conclusion. The approved action plan remains available for advisor review before any action is taken. We can revisit the timing, trade-offs, and open questions together.

For tax or legal matters, please discuss the details with your tax professional or attorney. This report is educational and illustrative. Projections are hypothetical and are not guarantees. We will keep the facts, assumptions, and open questions visible as we review next steps together.

Sincerely,
Your advisor`);
  const sections = Object.fromEntries(NARRATIVE_SECTION_IDS.map((id) => [id, genericSection(id.replaceAll('-', ' '))]));
  return { letter, sections, mode: 'TEMPLATE' };
}

export function validatedTemplateNarrative(context: NarrativeTemplateContext, validationContext: Parameters<typeof validateNarrativeContent>[1]): NarrativeContent {
  const primary = generateTemplateNarrative(context);
  if (validateNarrativeContent(primary, validationContext).valid) return primary;
  return generateFallbackNarrative(context);
}
