"use client";

import { CheckCircle2, RefreshCw, Save, Search, ShieldAlert, Undo2, WandSparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { responseMessage } from './api';
import type { NarrativeMode } from '@/lib/narrative/types';

type Narrative = {
  id: string;
  scenarioId: string;
  sourceAnalysisId: string;
  letter: string;
  sections: Record<string, string>;
  mode: NarrativeMode;
  approvedAt: string | null;
  revision: number;
  stale: boolean;
};
type NarrativeResponse = {
  analysisId: string;
  scenarioId: string;
  scenarioName: string;
  narrative: Narrative | null;
  csrfToken: string;
  ai?: { used: boolean; reason: string; model: string | null };
};
type LookupResponse = { answer: string; facts: Array<{ label: string; value: string; sourcePath: string }> };

function errorFor(response: Response, fallback: string): Promise<Error> {
  return response.status === 401
    ? Promise.resolve(new Error('Your advisor session has expired. Sign in again, then retry.'))
    : responseMessage(response, fallback).then((message) => new Error(message));
}

function modeLabel(mode: NarrativeMode): string {
  return mode === 'OPTIONAL_AI' ? 'Optional AI draft — advisor review required' : mode === 'EDITED' ? 'Advisor-edited draft — approval cleared' : 'Validated template draft';
}

/**
 * Deliberately standalone: parent integration may pass a selected scenario ID
 * without changing CoreWorkspace. All persisted work remains analysis-bound.
 */
export function NarrativeWorkspace({ clientId, scenarioId }: { clientId: string; scenarioId?: string | null }) {
  const [state, setState] = useState<NarrativeResponse | null>(null);
  const [letter, setLetter] = useState('');
  const [sections, setSections] = useState<Record<string, string>>({});
  const [requestOptionalAi, setRequestOptionalAi] = useState(false);
  const [dataSharingApproved, setDataSharingApproved] = useState(false);
  const [query, setQuery] = useState('');
  const [lookup, setLookup] = useState<LookupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function useNarrative(body: NarrativeResponse) {
    setState((current) => ({ ...current, ...body } as NarrativeResponse));
    if (body.narrative) { setLetter(body.narrative.letter); setSections(body.narrative.sections); }
  }

  async function load() {
    setLoading(true); setError('');
    try {
      const suffix = scenarioId ? `?scenarioId=${encodeURIComponent(scenarioId)}` : '';
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/narrative${suffix}`, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw await errorFor(response, 'Narrative workspace is unavailable.');
      useNarrative(await response.json() as NarrativeResponse);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Narrative workspace is unavailable.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [clientId, scenarioId]);

  async function mutate(path: string, method: 'POST' | 'PATCH', body: Record<string, unknown>, fallback: string): Promise<NarrativeResponse> {
    if (!state) throw new Error('Reload the narrative before continuing.');
    const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/narrative${path}`, {
      method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, csrfToken: state.csrfToken }),
    });
    if (!response.ok) throw await errorFor(response, fallback);
    return response.json() as Promise<NarrativeResponse>;
  }

  async function generate() {
    if (!state) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await mutate('', 'POST', {
        analysisId: state.analysisId, scenarioId: state.scenarioId, revision: state.narrative?.revision ?? 0,
        requestOptionalAi, dataSharingApproved: requestOptionalAi && dataSharingApproved,
      }, 'A narrative template could not be generated.');
      useNarrative(result);
      setNotice(result.ai?.used ? 'Optional AI created a draft. It is not approved; review every statement before approval.' : `Validated template generated. ${result.ai?.reason ?? ''}`.trim());
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'A narrative template could not be generated.'); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!state?.narrative) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await mutate('', 'PATCH', { analysisId: state.analysisId, scenarioId: state.scenarioId, revision: state.narrative.revision, letter, sections }, 'Narrative edits could not be saved.');
      useNarrative(result); setNotice('Narrative edits saved. Any prior approval was cleared.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Narrative edits could not be saved.'); }
    finally { setBusy(false); }
  }

  async function approve() {
    if (!state?.narrative) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await mutate('/approve', 'POST', { analysisId: state.analysisId, scenarioId: state.scenarioId, revision: state.narrative.revision }, 'Narrative approval could not be saved.');
      useNarrative(result); setNotice('Narrative approved for this exact analysis and scenario.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Narrative approval could not be saved.'); }
    finally { setBusy(false); }
  }

  async function revoke() {
    if (!state?.narrative) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await mutate('/revoke', 'POST', { scenarioId: state.scenarioId, revision: state.narrative.revision }, 'Narrative approval could not be revoked.');
      useNarrative(result); setNotice('Narrative approval revoked. This content will not be included in a report.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Narrative approval could not be revoked.'); }
    finally { setBusy(false); }
  }

  async function ask() {
    if (!state || query.trim().length < 3) { setError('Ask a results question using at least three characters.'); return; }
    setBusy(true); setError(''); setLookup(null);
    try {
      const result = await mutate('/ask', 'POST', { analysisId: state.analysisId, scenarioId: state.scenarioId, query }, 'The results lookup could not be completed.');
      setLookup(result as unknown as LookupResponse);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The results lookup could not be completed.'); }
    finally { setBusy(false); }
  }

  if (loading) return <section className="card"><p className="muted" aria-live="polite">Loading analysis-bound narrative…</p></section>;
  if (!state) return <section className="card"><p className="error" role="alert">{error || 'Narrative workspace is unavailable.'}</p><button className="button button-secondary" type="button" onClick={() => void load()}><RefreshCw aria-hidden="true" />Try again</button></section>;
  const narrative = state.narrative;
  const blocked = Boolean(narrative?.stale || (narrative && narrative.sourceAnalysisId !== state.analysisId));

  return <section className="analysis-workspace narrative-workspace">
    <header className="workspace-header"><div><p className="eyebrow">Advisor-reviewed report copy</p><h2 className="section-title">Narrative</h2><p className="muted">Bound to {state.scenarioName} and saved analysis {state.analysisId}. Only approved, current copy may enter a report.</p></div><button className="button button-secondary" type="button" onClick={() => void load()} disabled={busy}><RefreshCw aria-hidden="true" />Refresh</button></header>
    {(error || notice) && <p className={error ? 'error-banner' : 'notice'} role={error ? 'alert' : 'status'}>{error || notice}</p>}

    <section className="card"><p className="eyebrow">Generate</p><h3>Start from a validated template</h3><p className="muted">Templates use saved calculation facts, stated concerns, and only approved actions matched to this analysis. They never calculate results or auto-approve.</p>
      <label className="field"><span className="field-label"><input type="checkbox" checked={requestOptionalAi} onChange={(event) => setRequestOptionalAi(event.target.checked)} disabled={busy} /> Request optional AI drafting</span><small>Disabled unless a Hostinger-compatible provider is explicitly configured at runtime. Template fallback is always used on configuration, timeout, or validation failure.</small></label>
      {requestOptionalAi && <label className="field"><span className="field-label"><input type="checkbox" checked={dataSharingApproved} onChange={(event) => setDataSharingApproved(event.target.checked)} disabled={busy} /> Data-sharing approval is confirmed for this request</span><small>Only first name, ranked concerns, verified facts, and approved recommendations may be sent. DOB, contact details, uploads, SSNs, and account numbers are never sent.</small></label>}
      <div className="form-actions"><button className="button button-primary" type="button" onClick={() => void generate()} disabled={busy}><WandSparkles aria-hidden="true" />{busy ? 'Generating…' : narrative ? 'Regenerate draft' : 'Generate template'}</button></div>
    </section>

    {narrative && <>
      {blocked && <section className="card"><p className="error" role="alert"><ShieldAlert aria-hidden="true" />This narrative is stale because the saved analysis changed. Generate a new draft; stale copy cannot be edited, approved, exported, or included in a report.</p></section>}
      <section className="card"><p className="eyebrow">Review and edit</p><h3>{narrative.approvedAt ? 'Approved narrative' : modeLabel(narrative.mode)}</h3><p className="muted">The advisor letter must remain 150–250 words. Every section must have 2–3 sentences, and every number is validated against saved result or approved-action facts. Editing clears approval.</p>
        <label className="field"><span className="field-label">Advisor letter</span><textarea className="input" rows={12} value={letter} onChange={(event) => setLetter(event.target.value)} disabled={busy || blocked} /></label>
        {Object.entries(sections).map(([id, text]) => <label className="field" key={id}><span className="field-label">{id.replaceAll('-', ' ')}</span><textarea className="input" rows={3} value={text} onChange={(event) => setSections((current) => ({ ...current, [id]: event.target.value }))} disabled={busy || blocked} /></label>)}
        <div className="form-actions"><button className="button button-secondary" type="button" onClick={() => void save()} disabled={busy || blocked}><Save aria-hidden="true" />Save edits</button>{narrative.approvedAt ? <button className="button button-secondary" type="button" onClick={() => void revoke()} disabled={busy}><Undo2 aria-hidden="true" />Revoke approval</button> : <button className="button button-primary" type="button" onClick={() => void approve()} disabled={busy || blocked}><CheckCircle2 aria-hidden="true" />Approve for report</button>}</div>
      </section>
    </>}

    <section className="card"><p className="eyebrow">Ask about these results</p><h3>Deterministic results lookup</h3><p className="muted">This helper is not AI. It retrieves only saved calculation facts from this analysis and does not provide advice.</p><div className="form-actions"><label className="field"><span className="field-label">Question</span><input className="input" value={query} maxLength={280} onChange={(event) => setQuery(event.target.value)} placeholder="For example: What does the model show for healthcare?" /></label><button className="button button-secondary" type="button" onClick={() => void ask()} disabled={busy}><Search aria-hidden="true" />Look up results</button></div>
      {lookup && <div className="notice" role="status"><p>{lookup.answer}</p>{lookup.facts.length > 0 && <ul>{lookup.facts.map((fact) => <li key={fact.sourcePath}><strong>{fact.label}:</strong> {fact.value} <small>({fact.sourcePath})</small></li>)}</ul>}</div>}
    </section>
  </section>;
}
