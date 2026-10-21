"use client";

import { Check, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { formatCurrency, responseMessage, statusLabel } from "./api";

type EvidenceFact = { label: string; value: string; provenance: string };
type RuleEvaluation = { ruleId: string; category: string; priority: string; trigger: string; eligible: boolean; evidence: EvidenceFact[]; unavailable: string[]; solverEvidence?: Array<{ lever: string; status: string; detail: string; achievedSuccessPercent: number | null }> };
type Content = { title: string; body: string; nextStep: string; owner: string; targetDate: string | null; dollarImpact: number | null; impactLabel: string | null; lsrtHelp: string | null; evidence: RuleEvaluation; custom: boolean };
type Recommendation = { id: string; ruleId: string | null; category: string; priority: string; status: string; scenarioId: string | null; sourceAnalysisId: string | null; revision: number; createdAt: string; updatedAt: string; content: Content; approvalStale: boolean; reportEligible: boolean };
type Response = { analysisId: string; scenarioId: string; scenarioName: string; clientRevision: number; recommendations: Recommendation[]; evaluations: RuleEvaluation[]; csrfToken: string };
type EditForm = { title: string; body: string; nextStep: string; owner: string; targetDate: string; dollarImpact: string; impactLabel: string; lsrtHelp: string };
const EMPTY: EditForm = { title: "", body: "", nextStep: "", owner: "Advisor and client", targetDate: "", dollarImpact: "", impactLabel: "", lsrtHelp: "" };
function editForm(content: Content): EditForm { return { title: content.title, body: content.body, nextStep: content.nextStep, owner: content.owner, targetDate: content.targetDate ?? "", dollarImpact: content.dollarImpact === null ? "" : String(content.dollarImpact), impactLabel: content.impactLabel ?? "", lsrtHelp: content.lsrtHelp ?? "" }; }
function contentFromForm(form: EditForm) {
  const impact = form.dollarImpact.trim() ? Number(form.dollarImpact) : null;
  if (form.dollarImpact.trim() && !Number.isFinite(impact)) throw new Error("Dollar impact must be a number or blank.");
  return { title: form.title, body: form.body, nextStep: form.nextStep, owner: form.owner, targetDate: form.targetDate || null, dollarImpact: impact, impactLabel: form.impactLabel || null, lsrtHelp: form.lsrtHelp || null };
}
function errorFor(response: Response | globalThis.Response, fallback: string) { return responseMessage(response as globalThis.Response, fallback).then((message) => new Error(message)); }

export function RecommendationsWorkspace({ clientId, scenarioId }: { clientId: string; scenarioId?: string }) {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<string | "custom" | null>(null);
  const [form, setForm] = useState<EditForm>(EMPTY);

  async function load() {
    setLoading(true); setError("");
    try {
      const query = scenarioId ? `?scenarioId=${encodeURIComponent(scenarioId)}` : "";
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/recommendations${query}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw await errorFor(response, "Recommendations are unavailable.");
      setData(await response.json() as Response);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Recommendations are unavailable."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [clientId, scenarioId]);

  async function refresh() {
    if (!data) return;
    setWorking(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/recommendations`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh", scenarioId: scenarioId ?? null, clientRevision: data.clientRevision, csrfToken: data.csrfToken }) });
      if (response.status === 409) throw new Error("The client or analysis changed. Reload before refreshing recommendations.");
      if (!response.ok) throw await errorFor(response, "Recommendations could not be refreshed.");
      setData(await response.json() as Response); setNotice("Recommendations refreshed from the current saved analysis. Advisor edits and approvals were preserved.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Recommendations could not be refreshed."); }
    finally { setWorking(false); }
  }

  async function mutate(recommendation: Recommendation, action: "approve" | "edit" | "remove", edited?: EditForm) {
    if (!data) return;
    setWorking(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/recommendations/${encodeURIComponent(recommendation.id)}`, { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, revision: recommendation.revision, content: edited ? contentFromForm(edited) : undefined, csrfToken: data.csrfToken }) });
      if (response.status === 409) throw new Error(action === "approve" ? "This proposal is stale. Refresh or edit it against the current analysis before approval." : "This recommendation changed elsewhere. Reload before saving.");
      if (!response.ok) throw await errorFor(response, "Recommendation could not be updated.");
      const result = await response.json() as { recommendation: Recommendation; csrfToken: string };
      setData((current) => current ? { ...current, csrfToken: result.csrfToken, recommendations: current.recommendations.map((item) => item.id === result.recommendation.id ? result.recommendation : item) } : current);
      setEditing(null); setNotice(action === "edit" ? "Recommendation saved as edited. Approval was cleared." : action === "approve" ? "Recommendation approved for this saved analysis." : "Recommendation removed from the action plan.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Recommendation could not be updated."); }
    finally { setWorking(false); }
  }

  async function createCustom() {
    if (!data) return;
    setWorking(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/recommendations`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "custom", scenarioId: scenarioId ?? null, clientRevision: data.clientRevision, content: contentFromForm(form), csrfToken: data.csrfToken }) });
      if (!response.ok) throw await errorFor(response, "Custom action could not be added.");
      const result = await response.json() as { recommendation: Recommendation; csrfToken: string };
      setData((current) => current ? { ...current, csrfToken: result.csrfToken, recommendations: [...current.recommendations, result.recommendation] } : current);
      setEditing(null); setForm(EMPTY); setNotice("Custom action saved. Explicit approval is required before it can be included in a report.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Custom action could not be added."); }
    finally { setWorking(false); }
  }

  if (loading) return <section className="card"><p className="muted" aria-live="polite">Loading evidence-based recommendations…</p></section>;
  if (!data) return <section className="card"><p className="error" role="alert">{error || "Recommendations are unavailable."}</p><button className="button button-secondary" type="button" onClick={() => void load()}><RefreshCw aria-hidden="true" />Retry</button></section>;
  const visible = data.recommendations.filter((recommendation) => recommendation.status !== "REMOVED");
  const triggered = data.evaluations.filter((evaluation) => evaluation.eligible);
  return <section className="analysis-workspace">
    <header className="workspace-header"><div><p className="eyebrow">Advisor-reviewed action plan</p><h2 className="section-title">Recommendations · {data.scenarioName}</h2><p className="muted">Only explicitly approved actions whose source analysis still matches can be included in a report. Educational proposals are not product quotes or guarantees.</p></div><div className="form-actions"><button className="button button-secondary" type="button" onClick={() => void load()} disabled={working}><RefreshCw aria-hidden="true" />Reload</button><button className="button button-primary" type="button" onClick={() => void refresh()} disabled={working}><RefreshCw aria-hidden="true" />{working ? "Working…" : "Refresh proposals"}</button></div></header>
    {(error || notice) && <p className={error ? "error-banner" : "notice"} role={error ? "alert" : "status"}>{error || notice}</p>}

    <section className="card"><p className="eyebrow">Current rule evaluation</p><h3>{triggered.length} review candidate{triggered.length === 1 ? "" : "s"} from 25 documented rules</h3><p className="muted">Each rule remains visible below, including unavailable facts. Refresh runs only documented bounded solver checks and does not change approved or edited content.</p><details><summary>All rule evidence ({data.evaluations.length})</summary><div className="table-wrap"><table><thead><tr><th>Rule</th><th>Trigger</th><th>Evidence</th><th>Availability</th></tr></thead><tbody>{data.evaluations.map((evaluation) => <tr key={evaluation.ruleId}><td><strong>{evaluation.ruleId}</strong><br /><small>{evaluation.category}</small></td><td>{evaluation.trigger}</td><td>{evaluation.evidence.length ? evaluation.evidence.map((item) => <div key={`${item.label}-${item.value}`}><small>{item.label}: {item.value}</small></div>) : "—"}</td><td>{evaluation.eligible ? "Review candidate" : evaluation.unavailable.join(" ") || "Not triggered"}</td></tr>)}</tbody></table></div></details></section>

    <section className="card"><div className="workspace-header"><div><p className="eyebrow">Custom action</p><h3>Add an advisor-created action</h3></div><button className="button button-secondary" type="button" onClick={() => { setEditing("custom"); setForm(EMPTY); }} disabled={working}><Plus aria-hidden="true" />Add action</button></div>{editing === "custom" && <Editor form={form} setForm={setForm} submitLabel="Save custom action" busy={working} onSave={() => void createCustom()} onCancel={() => setEditing(null)} />}</section>

    <section className="profile-step"><p className="eyebrow">Proposals and approved actions</p>{visible.length === 0 ? <div className="card"><p className="muted">No saved proposals yet. Refresh to save current eligible proposals, or add a custom action.</p></div> : visible.map((recommendation) => <article className="card" key={recommendation.id}><div className="workspace-header"><div><p className="eyebrow">{recommendation.ruleId ?? "Custom"} · {recommendation.category} · {recommendation.priority}</p><h3>{recommendation.content.title}</h3><p className="muted">{statusLabel(recommendation.status)}{recommendation.approvalStale ? " · Approval is stale" : recommendation.reportEligible ? " · Eligible for matching report lineage" : ""}</p></div><div className="form-actions">{recommendation.status !== "APPROVED" && !recommendation.approvalStale && <button className="button button-primary" type="button" disabled={working} onClick={() => void mutate(recommendation, "approve")}><Check aria-hidden="true" />Approve</button>}<button className="button button-secondary" type="button" disabled={working} onClick={() => { setEditing(recommendation.id); setForm(editForm(recommendation.content)); }}><Pencil aria-hidden="true" />Edit</button><button className="button button-secondary" type="button" disabled={working} onClick={() => void mutate(recommendation, "remove")}><Trash2 aria-hidden="true" />Remove</button></div></div>{editing === recommendation.id ? <Editor form={form} setForm={setForm} submitLabel="Save edited action" busy={working} onSave={() => void mutate(recommendation, "edit", form)} onCancel={() => setEditing(null)} /> : <><p>{recommendation.content.body}</p><p><strong>Next step:</strong> {recommendation.content.nextStep}</p><p className="muted"><strong>Owner:</strong> {recommendation.content.owner}{recommendation.content.targetDate ? ` · Target ${recommendation.content.targetDate}` : ""}{recommendation.content.dollarImpact !== null ? ` · ${recommendation.content.impactLabel || "Impact"}: ${formatCurrency(recommendation.content.dollarImpact)}` : ""}</p>{recommendation.content.evidence.evidence.length > 0 && <details><summary>Trigger evidence</summary><ul>{recommendation.content.evidence.evidence.map((item) => <li key={`${item.label}-${item.value}`}>{item.label}: {item.value} <span className="muted">({item.provenance.toLowerCase().replaceAll("_", " ")})</span></li>)}</ul>{recommendation.content.evidence.unavailable.length > 0 && <p className="muted">Limits: {recommendation.content.evidence.unavailable.join(" ")}</p>}</details>}</>}</article>)}</section>
  </section>;
}

function Editor({ form, setForm, submitLabel, busy, onSave, onCancel }: { form: EditForm; setForm: (value: EditForm) => void; submitLabel: string; busy: boolean; onSave: () => void; onCancel: () => void }) {
  const set = (key: keyof EditForm, value: string) => setForm({ ...form, [key]: value });
  return <div className="profile-step"><div className="form-grid"><label className="field"><span className="field-label">Title</span><input className="input" value={form.title} maxLength={240} onChange={(event) => set("title", event.target.value)} /></label><label className="field"><span className="field-label">Owner</span><input className="input" value={form.owner} maxLength={120} onChange={(event) => set("owner", event.target.value)} /></label><label className="field"><span className="field-label">Target date (optional)</span><input className="input" type="date" value={form.targetDate} onChange={(event) => set("targetDate", event.target.value)} /></label><label className="field"><span className="field-label">Dollar impact (optional)</span><input className="input" inputMode="decimal" value={form.dollarImpact} onChange={(event) => set("dollarImpact", event.target.value)} /></label><label className="field"><span className="field-label">Impact label (optional)</span><input className="input" value={form.impactLabel} maxLength={240} onChange={(event) => set("impactLabel", event.target.value)} /></label></div><label className="field"><span className="field-label">Action</span><textarea className="input" rows={4} value={form.body} maxLength={8000} onChange={(event) => set("body", event.target.value)} /></label><label className="field"><span className="field-label">Next step</span><textarea className="input" rows={2} value={form.nextStep} maxLength={1000} onChange={(event) => set("nextStep", event.target.value)} /></label><label className="field"><span className="field-label">Optional LSRT help line</span><textarea className="input" rows={2} value={form.lsrtHelp} maxLength={1000} onChange={(event) => set("lsrtHelp", event.target.value)} /></label><div className="form-actions"><button className="button button-primary" type="button" disabled={busy} onClick={onSave}><Check aria-hidden="true" />{submitLabel}</button><button className="button button-secondary" type="button" disabled={busy} onClick={onCancel}><X aria-hidden="true" />Cancel</button></div></div>;
}
