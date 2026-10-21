"use client";

import { Download, FileText, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDate, responseMessage } from "./api";

type ReportSection = { id: string; label: string };
type Branding = { coverText: string; letter: string; additionalDisclosure: string; logoDataUrl?: string | null };
type ReportRow = {
  id: string;
  version: number;
  status: "QUEUED" | "GENERATING" | "FAILED" | "READY" | string;
  generatedAt: string;
  completedAt: string | null;
  sentAt?: string | null;
  errorCode: string | null;
  checksum: string | null;
  retainUntil?: string | null;
};
type ReportsResponse = { reports: ReportRow[]; sections: ReportSection[]; branding: Branding; csrfToken: string };

function requestKey(): string {
  const uuid = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `report-${uuid}`;
}
function reportStatus(status: ReportRow["status"]): string {
  if (status === "QUEUED") return "Queued";
  if (status === "GENERATING") return "Generating";
  if (status === "READY") return "Ready";
  if (status === "FAILED") return "Failed";
  return status || "Unknown";
}
function statusClass(status: ReportRow["status"]): string {
  return status === "READY" ? "success" : status === "FAILED" ? "error" : "notice";
}
function reportErrorExplanation(code: string): string {
  if (code === "REPORT_LAYOUT_OVERFLOW") return "Content would extend beyond a page. No clipped PDF was saved. Shorten a long advisor letter or cover note before creating a new version.";
  if (code === "REPORT_RUNTIME_UNAVAILABLE") return "The server PDF renderer is not configured. No report was generated or emailed.";
  return "The report could not be generated. Prior versions remain unchanged and no email was sent.";
}
async function errorFor(response: Response, fallback: string): Promise<Error> {
  if (response.status === 401) return new Error("Your advisor session has expired. Sign in again, then retry.");
  return new Error(await responseMessage(response, fallback));
}

export function ReportsWorkspace({ clientId, revision }: { clientId: string; revision: number }) {
  const [data, setData] = useState<ReportsResponse | null>(null);
  const [sections, setSections] = useState<string[]>([]);
  const [coverNote, setCoverNote] = useState("");
  const [letter, setLetter] = useState("");
  const [letterApproved, setLetterApproved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/reports`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw await errorFor(response, "Report history is unavailable.");
      const body = await response.json() as ReportsResponse;
      setData(body);
      setSections((current) => current.length ? current.filter((id) => body.sections.some((section) => section.id === id)) : body.sections.map((section) => section.id));
      setLetter((current) => current || body.branding.letter || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Report history is unavailable. Try again.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [clientId]);

  function toggleSection(id: string) {
    setSections((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function generate(retryOf?: ReportRow) {
    if (!data) return;
    setError(""); setNotice("");
    if (!sections.length) { setError("Select at least one report section before generating."); return; }
    if (letter.trim().length < 30 || letter.trim().length > 5000) { setError("The editable advisor letter must be between 30 and 5,000 characters."); return; }
    if (!letterApproved) { setError("Confirm that you approve the editable advisor letter before generating a report."); return; }
    setGenerating(true);
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/reports`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestKey: requestKey(), sections, coverNote, letter, letterApproved: true, revision, csrfToken: data.csrfToken }),
      });
      if (response.status === 409) throw new Error("The client record changed elsewhere. Refresh the client workspace before creating a report.");
      if (!response.ok) throw await errorFor(response, "The report could not be queued.");
      const body = await response.json() as { reports?: ReportRow[]; message?: string };
      if (body.reports) {
        const reports = body.reports;
        setData((current) => current ? { ...current, reports } : current);
      }
      setNotice(retryOf ? "A new report request was created with a new request key. Prior report versions remain unchanged." : body.message || "Report request created. No email was sent.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The report could not be queued.");
    } finally { setGenerating(false); }
  }

  async function download(report: ReportRow) {
    if (!data) return;
    setDownloadingId(report.id); setError("");
    try {
      const linkResponse = await fetch(`/api/reports/${encodeURIComponent(report.id)}/link`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csrfToken: data.csrfToken }),
      });
      if (!linkResponse.ok) throw await errorFor(linkResponse, "The private download link could not be prepared.");
      const link = await linkResponse.json() as { downloadUrl?: string; expiresIn?: number };
      if (!link.downloadUrl || typeof link.expiresIn !== "number") throw new Error("The private download link was unavailable. Refresh report history and try again.");
      const fileResponse = await fetch(link.downloadUrl, { credentials: "same-origin", cache: "no-store" });
      if (!fileResponse.ok) throw await errorFor(fileResponse, "The private report could not be downloaded.");
      const blob = await fileResponse.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `RetirementExpert-Report-v${report.version}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setNotice(`Private report version ${report.version} downloaded. The time-limited authenticated link was not opened directly.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The private report could not be downloaded.");
    } finally { setDownloadingId(null); }
  }

  if (loading) return <section className="card loading-card"><p className="muted" aria-live="polite">Loading private report history…</p></section>;
  if (!data) return <section className="card"><p className="error" role="alert">{error || "Report history is unavailable."}</p><button className="button button-secondary" type="button" onClick={() => void load()}><RefreshCw aria-hidden="true" />Try again</button></section>;

  return <section className="reports-workspace">
    <header className="workspace-header"><div><p className="eyebrow">Private PDF reports</p><h2 className="section-title">Reports</h2><p className="muted">Generation creates a private, immutable snapshot. It never sends an email automatically.</p></div><button className="button button-secondary" type="button" onClick={() => void load()} disabled={loading || generating}><RefreshCw aria-hidden="true" />Refresh history</button></header>
    {(error || notice) && <p className={error ? "error-banner" : "notice"} role={error ? "alert" : "status"}>{error || notice}</p>}

    <section className="card report-builder"><p className="eyebrow">New immutable version</p><h3>Prepare a client report</h3><p className="muted">Changing the selections or letter today does not alter any saved prior report version. No delivery or email action is included here.</p>
      <fieldset className="report-section-picker"><legend>Included report sections</legend><div className="option-list">{data.sections.map((section) => <label className="checkbox-label" key={section.id}><input type="checkbox" checked={sections.includes(section.id)} onChange={() => toggleSection(section.id)} />{section.label}</label>)}</div></fieldset>
      <label className="field"><span className="field-label">Cover note <small>(optional, up to 500 characters)</small></span><textarea className="input" rows={3} maxLength={500} value={coverNote} onChange={(event) => setCoverNote(event.target.value)} /></label>
      <label className="field"><span className="field-label">Editable advisor letter</span><textarea className="input" rows={10} minLength={30} maxLength={5000} value={letter} onChange={(event) => setLetter(event.target.value)} required /><small>{letter.trim().length} / 5,000 characters. This letter is saved into the generated report snapshot, not automatically emailed.</small></label>
      <label className="checkbox-label report-approval"><input type="checkbox" checked={letterApproved} onChange={(event) => setLetterApproved(event.target.checked)} />I have reviewed and explicitly approve this editable advisor letter for this report.</label>
      <div className="form-actions"><button className="button button-primary" type="button" onClick={() => void generate()} disabled={generating || !letterApproved}><FileText aria-hidden="true" />{generating ? "Generating…" : "Generate private report"}</button><span className="muted">No automatic emails. Ready reports remain private until downloaded by an authenticated advisor.</span></div>
    </section>

    <section className="card report-history"><p className="eyebrow">Saved versions</p><h3>Report history</h3>{data.reports.length ? <div className="table-wrap"><table><thead><tr><th>Version</th><th>Status</th><th>Created</th><th>Completed</th><th>Checksum</th><th>Action</th></tr></thead><tbody>{data.reports.map((report) => <tr key={report.id}><td>v{report.version}</td><td><span className={statusClass(report.status)}>{reportStatus(report.status)}</span>{report.errorCode ? <small className="muted">{reportErrorExplanation(report.errorCode)}</small> : null}</td><td>{formatDate(report.generatedAt)}</td><td>{formatDate(report.completedAt)}</td><td><code>{report.checksum || "Not available"}</code></td><td>{report.status === "READY" ? <button className="button button-secondary button-small" type="button" onClick={() => void download(report)} disabled={downloadingId === report.id}><Download aria-hidden="true" />{downloadingId === report.id ? "Preparing…" : "Download"}</button> : report.status === "FAILED" ? <button className="button button-secondary button-small" type="button" onClick={() => void generate(report)} disabled={generating}><RefreshCw aria-hidden="true" />Retry as new version</button> : <span className="muted">{report.status === "GENERATING" ? "Generation in progress" : "Awaiting generation"}</span>}</td></tr>)}</tbody></table></div> : <p className="muted">No report versions have been requested yet.</p>}
      <p className="notice">Each history row is an immutable snapshot. A Retry creates a new report request with a new request key; it does not overwrite the failed or prior version.</p>
    </section>
  </section>;
}
