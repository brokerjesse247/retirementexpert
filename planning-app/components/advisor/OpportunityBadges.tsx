"use client";

type EvidenceFact = { label: string; value: string };
export type OpportunityBadgeEvaluation = { ruleId: string; category: string; eligible: boolean; trigger: string; evidence: EvidenceFact[]; unavailable?: string[] };
const flagLabels: Record<string, string> = { R03: 'Income / annuity review', R08: 'Tax-free income planning review', R20: 'Long-term-care review', R22: 'Life insurance gap review', R23: 'Estate / legacy review' };
/** Factual review candidates only: not product recommendations or guarantees. */
export function OpportunityBadges({ evaluations, max = 5 }: { evaluations: OpportunityBadgeEvaluation[]; max?: number }) {
  const candidates = evaluations.filter(e => e.eligible && flagLabels[e.ruleId]).slice(0, Math.max(0, max));
  if (!candidates.length) return <p className="muted">No evidence-based protection or income review flags are currently triggered.</p>;
  return <div className="opportunity-badges" aria-label="Evidence-based review candidates">{candidates.map(candidate => <details key={candidate.ruleId}><summary className="opportunity-badge">{flagLabels[candidate.ruleId]}</summary><div className="notice"><strong>{candidate.ruleId} · Review candidate</strong><p>{candidate.trigger}</p>{candidate.evidence.length > 0 && <p className="muted">{candidate.evidence.map(f => `${f.label}: ${f.value}`).join(' · ')}</p>}<p className="muted">Review the evidence in Recommendations. This flag does not select a product or approve advice.</p></div></details>)}</div>;
}
