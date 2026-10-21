"use client";

import { useEffect, useState } from 'react';
import { formatDate, responseMessage, statusLabel } from './api';

type ReviewState = { csrfToken: string; client: { status: string; revision: number; nextReviewDate: string | null }; defaultReviewDate: string; emailDispatchHeld: boolean; deliveries: Array<{ id: string; kind: string; requestedAt: string; reviewDate: string; delivery: { status: string; sentAt: string | null; lastErrorCode: string | null } | null }> };
type ReadyReport = { id: string; version: number; status: string };
export function AnnualReviewWorkspace({ clientId, onChanged }: { clientId: string; onChanged?: () => void }) {
  const [data, setData] = useState<ReviewState | null>(null);
  const [reports, setReports] = useState<ReadyReport[]>([]);
  const [reportId, setReportId] = useState('');
  const [date, setDate] = useState('');
  const [presentConfirmed, setPresentConfirmed] = useState(false);
  const [requestConfirmed, setRequestConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function load() {
    setError('');
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/annual-review`, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error(await responseMessage(response, 'Annual review information is unavailable.'));
      const body = await response.json() as ReviewState;
      setData(body); setDate(body.client.nextReviewDate?.slice(0, 10) || body.defaultReviewDate);
      const history = await fetch(`/api/clients/${encodeURIComponent(clientId)}/reports`, { cache: 'no-store', credentials: 'same-origin' });
      if (!history.ok) throw new Error(await responseMessage(history, 'Report history is unavailable.'));
      const ready = ((await history.json()).reports as ReadyReport[]).filter(r => r.status === 'READY');
      setReports(ready); setReportId(current => ready.some(r => r.id === current) ? current : ready[0]?.id ?? '');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load review information.'); }
  }
  useEffect(() => { void load(); }, [clientId]);
  async function action(kind: 'PRESENT' | 'SET_DATE' | 'REQUEST_UPDATE' | 'START_IMPLEMENTATION') {
    if (!data) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/annual-review`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: kind, revision: data.client.revision, csrfToken: data.csrfToken, ...((kind === 'PRESENT' || kind === 'SET_DATE') ? { reviewDate: date } : {}), ...(kind === 'PRESENT' ? { reportId } : {}) }) });
      if (!response.ok) throw new Error(await responseMessage(response, 'Review action could not be saved.'));
      const body = await response.json() as ReviewState & { result?: { duplicate?: boolean } };
      setData(body);
      setNotice(kind === 'START_IMPLEMENTATION' ? 'Plan marked implementing. No product or transaction was submitted.' : kind === 'PRESENT' ? 'Report presentation recorded and annual review scheduled. No email was sent.' : kind === 'SET_DATE' ? 'Annual review date saved.' : body.result?.duplicate ? 'An update request already exists for this review cycle. No duplicate email was queued.' : body.emailDispatchHeld ? 'Prefilled seven-day update link queued securely. Email delivery is held until production mail is approved; the client has not been emailed.' : 'Prefilled update link queued for delivery. Queued does not mean delivered.');
      setPresentConfirmed(false); setRequestConfirmed(false);
      if (kind !== 'REQUEST_UPDATE') onChanged?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Review action failed.'); }
    finally { setBusy(false); }
  }
  if (!data) return <section className="card"><p className={error ? 'error' : 'muted'} role={error ? 'alert' : 'status'}>{error || 'Loading annual review…'}</p>{error && <button className="button button-secondary" onClick={() => void load()}>Retry</button>}</section>;
  return <section className="annual-review-workspace">
    <header className="workspace-header"><div><p className="eyebrow">Client follow-through</p><h2>Annual review</h2><p className="muted">Status: {statusLabel(data.client.status)} · Next review: {formatDate(data.client.nextReviewDate)}</p></div><button className="button button-secondary" disabled={busy} onClick={() => void load()}>Refresh</button></header>
    {(error || notice) && <p role={error ? 'alert' : 'status'} className={error ? 'error-banner' : 'notice'}>{error || notice}</p>}
    <section className="card"><h3>Record presentation and schedule the next review</h3><p className="muted">Downloading a PDF does not mark it presented. Record presentation only after discussing it with the client.</p><div className="form-grid"><label className="field"><span>Ready report</span><select className="input" value={reportId} onChange={e => { setReportId(e.target.value); setPresentConfirmed(false); }}><option value="">Choose a report</option>{reports.map(r => <option key={r.id} value={r.id}>Report v{r.version}</option>)}</select></label><label className="field"><span>Next review date</span><input className="input" type="date" value={date} onChange={e => { setDate(e.target.value); setPresentConfirmed(false); }} /></label></div><label className="checkbox-label"><input type="checkbox" checked={presentConfirmed} onChange={e => setPresentConfirmed(e.target.checked)} />I presented the selected report to the client.</label><div className="form-actions"><button className="button button-primary" disabled={busy || !reportId || !date || !presentConfirmed} onClick={() => void action('PRESENT')}>Record presentation</button><button className="button button-secondary" disabled={busy || !date} onClick={() => void action('SET_DATE')}>Save review date only</button></div>{!reports.length && <p className="muted">Generate a ready report before recording presentation.</p>}<p className="muted">An advisor reminder is queued thirty days before the date when the signed production scheduler is activated.</p></section>
    <section className="card"><h3>Implementation follow-through</h3><p className="muted">Move a presented plan into implementation after agreeing on next steps. This does not submit any product application or transaction.</p><button className="button button-secondary" disabled={busy || data.client.status !== 'PRESENTED'} onClick={() => void action('START_IMPLEMENTATION')}>Mark implementing</button></section>
    <section className="card"><h3>Request an information update</h3><p className="muted">The client receives a private, expiring link prefilled with their previous answers. They must review the questions and consent again. Existing reports never change.</p><label className="checkbox-label"><input type="checkbox" checked={requestConfirmed} onChange={e => setRequestConfirmed(e.target.checked)} />Queue an annual update request to this client’s saved email address.</label><button className="button button-primary" disabled={busy || !requestConfirmed || !data.client.nextReviewDate} onClick={() => void action('REQUEST_UPDATE')}>Queue update link</button>{data.emailDispatchHeld && <p className="notice">Email delivery is currently on hold. Queuing does not send a message.</p>}</section>
    <section className="card"><h3>Review communication history</h3>{data.deliveries.length ? <div className="table-wrap"><table><thead><tr><th>Action</th><th>Review date</th><th>Requested</th><th>Email status</th></tr></thead><tbody>{data.deliveries.map(d => <tr key={d.id}><td>{d.kind === 'UPDATE_REQUEST' ? 'Client update request' : 'Advisor reminder'}</td><td>{formatDate(d.reviewDate)}</td><td>{formatDate(d.requestedAt)}</td><td>{d.delivery ? statusLabel(d.delivery.status) : 'Not queued'}{d.delivery?.sentAt && <small>Sent {formatDate(d.delivery.sentAt)}</small>}</td></tr>)}</tbody></table></div> : <p className="muted">No reminder or update request is recorded.</p>}</section>
  </section>;
}
