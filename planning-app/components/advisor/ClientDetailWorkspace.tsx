"use client";

import Link from "next/link";
import { Download, FileLock2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDate, responseMessage, statusLabel } from "./api";
import { AnalysisWorkspace } from "./AnalysisWorkspace";
import { ProfileEditor } from "./ProfileEditor";
import { ReportsWorkspace } from "./ReportsWorkspace";
import { RecommendationsWorkspace } from "./RecommendationsWorkspace";
import { ScenariosWorkspace } from "./ScenariosWorkspace";
import { NarrativeWorkspace } from "./NarrativeWorkspace";
import { NotesTasksWorkspace } from "./NotesTasksWorkspace";
import { AnnualReviewWorkspace } from "./AnnualReviewWorkspace";
import { ClientOpportunityBadges } from "./ClientOpportunityBadges";
import type { ClientDetailResponse, JsonRecord } from "./types";

type Upload = { id: string; name: string; size: number } | null;
const reviewStatuses = ["NEW", "IN_REVIEW", "ANNUAL_REVIEW_DUE", "ARCHIVED"];

function formatSize(bytes: number) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024) + " MB"; }

export function ClientDetailWorkspace({ clientId }: { clientId: string }) {
  const [record, setRecord] = useState<ClientDetailResponse | null>(null);
  const [data, setData] = useState<JsonRecord | null>(null);
  const [status, setStatus] = useState("");
  const [upload, setUpload] = useState<Upload>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState<"profile" | "analysis" | "reports" | "recommendations" | "scenarios" | "narrative" | "notes" | "review">("profile");

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}`, { credentials: "same-origin", cache: "no-store" });
      if (response.status === 404) throw new Error("This client record is not available to your account.");
      if (!response.ok) throw new Error(await responseMessage(response, "Client data is unavailable."));
      const next = await response.json() as ClientDetailResponse;
      setRecord(next); setData(next.data); setStatus(next.client.status);
      const uploadResponse = await fetch(`/api/clients/${encodeURIComponent(clientId)}/upload`, { credentials: "same-origin", cache: "no-store" });
      if (uploadResponse.ok) { const uploadBody = await uploadResponse.json() as { upload: Upload }; setUpload(uploadBody.upload); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Client data is unavailable."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [clientId]);

  async function save() {
    if (!record || !data) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}`, {
        method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, status, revision: record.revision, csrfToken: record.csrfToken }),
      });
      if (response.status === 409) throw new Error("This record changed elsewhere. Reload it before saving so no updates are overwritten.");
      if (!response.ok) throw new Error(await responseMessage(response, "Changes could not be saved. Please review the highlighted intake values."));
      const body = await response.json() as { ok?: boolean; revision?: number };
      if (!body.ok || typeof body.revision !== "number") throw new Error("The server did not confirm the update. Please refresh and try again.");
      setRecord({ ...record, revision: body.revision, client: { ...record.client, status } });
      setNotice("Changes saved securely.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Changes could not be saved."); }
    finally { setSaving(false); }
  }

  async function downloadUpload() {
    if (!record || !upload) return;
    setDownloading(true); setError("");
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/upload`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csrfToken: record.csrfToken }) });
      if (!response.ok) throw new Error(await responseMessage(response, "The private document could not be opened."));
      const body = await response.json() as { downloadUrl?: string };
      if (!body.downloadUrl) throw new Error("The private document link was unavailable.");
      window.location.assign(body.downloadUrl);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The private document could not be opened."); }
    finally { setDownloading(false); }
  }

  if (loading) return <section className="card"><p className="muted" aria-live="polite">Loading secure client record…</p></section>;
  if (error && !record) return <section className="card"><p className="error" role="alert">{error}</p><Link className="button button-secondary" href="/dashboard/clients">Back to clients</Link></section>;
  if (!record || !data) return null;
  const selectableStatuses = reviewStatuses.includes(status) ? reviewStatuses : [status, ...reviewStatuses];
  return <section className="client-detail-workspace">
    <header className="workspace-header"><div><Link className="muted back-link" href="/dashboard/clients">Clients</Link><p className="eyebrow">Client workspace</p><h1>{record.client.name}</h1><p className="muted">Submitted {formatDate(record.client.submittedAt)} · Last updated {formatDate(record.client.updatedAt)}</p></div>{activeTab === "profile" && <button className="button button-primary" type="button" onClick={() => void save()} disabled={saving}><Save aria-hidden="true" />{saving ? "Saving…" : "Save changes"}</button>}</header>
    <div className="profile-tabs client-tabs" role="tablist" aria-label="Client workspace">
      <button className={activeTab === "profile" ? "active" : ""} type="button" role="tab" aria-selected={activeTab === "profile"} onClick={() => setActiveTab("profile")}>Profile</button>
      <button className={activeTab === "analysis" ? "active" : ""} type="button" role="tab" aria-selected={activeTab === "analysis"} onClick={() => setActiveTab("analysis")}>Analysis</button>
      <button className={activeTab === "reports" ? "active" : ""} type="button" role="tab" aria-selected={activeTab === "reports"} onClick={() => setActiveTab("reports")}>Reports</button>
      <button className={activeTab === "recommendations" ? "active" : ""} type="button" role="tab" aria-selected={activeTab === "recommendations"} onClick={() => setActiveTab("recommendations")}>Recommendations</button>
      <button className={activeTab === "scenarios" ? "active" : ""} type="button" role="tab" aria-selected={activeTab === "scenarios"} onClick={() => setActiveTab("scenarios")}>Scenarios</button>
      <button className={activeTab === "narrative" ? "active" : ""} type="button" role="tab" aria-selected={activeTab === "narrative"} onClick={() => setActiveTab("narrative")}>Narrative</button>
      <button className={activeTab === "notes" ? "active" : ""} type="button" role="tab" aria-selected={activeTab === "notes"} onClick={() => setActiveTab("notes")}>Notes & tasks</button>
      <button className={activeTab === "review" ? "active" : ""} type="button" role="tab" aria-selected={activeTab === "review"} onClick={() => setActiveTab("review")}>Annual review</button>
    </div>
    <ClientOpportunityBadges clientId={clientId} key={record.revision} />
    {activeTab === "profile" && <>
      {(error || notice) && <p className={error ? "error" : "notice"} role={error ? "alert" : "status"}>{error || notice}</p>}
      <section className="card profile-status"><div><p className="eyebrow">Review status</p><h2 className="section-title">Manage the intake review</h2><p className="muted">Profile editing retains the submitted intake. Analysis and reports use their own saved, authenticated workflows.</p></div><label className="field"><span>Status</span><select className="input" value={status} onChange={(event) => setStatus(event.target.value)}>{selectableStatuses.map((option) => <option key={option} value={option}>{statusLabel(option)}</option>)}</select></label></section>
      <section className="card private-upload"><div><p className="eyebrow">Private document</p><h2 className="section-title">SSA statement</h2>{upload ? <p className="muted">{upload.name} · {formatSize(upload.size)} · accessible only through an authorized, time-limited download.</p> : <p className="muted">No optional SSA statement was submitted with this intake.</p>}</div>{upload && <button className="button button-secondary" type="button" onClick={() => void downloadUpload()} disabled={downloading}><FileLock2 aria-hidden="true" /><Download aria-hidden="true" />{downloading ? "Preparing…" : "Authorized download"}</button>}</section>
      <section className="card"><p className="eyebrow">Intake data</p><h2 className="section-title">Profile details</h2><ProfileEditor data={data} onChange={setData} /></section>
    </>}
    {activeTab === "analysis" && <AnalysisWorkspace clientId={clientId} />}
    {activeTab === "reports" && <ReportsWorkspace clientId={clientId} revision={record.revision} />}
    {activeTab === "recommendations" && <RecommendationsWorkspace clientId={clientId} />}
    {activeTab === "scenarios" && <ScenariosWorkspace clientId={clientId} />}
    {activeTab === "narrative" && <NarrativeWorkspace clientId={clientId} />}
    {activeTab === "notes" && <NotesTasksWorkspace clientId={clientId} />}
    {activeTab === "review" && <AnnualReviewWorkspace clientId={clientId} onChanged={() => void load()} />}
  </section>;
}
