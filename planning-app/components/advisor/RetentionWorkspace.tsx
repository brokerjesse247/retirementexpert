"use client";

import { type FormEvent, useEffect, useState } from "react";
import { formatDate, responseMessage } from "./api";

type RetentionState = {
  retentionHold: boolean;
  revision: number;
  reportRetention: {
    reportCount: number;
    earliestRetainUntil: string | null;
    latestRetainUntil: string | null;
  };
};

type RetentionResponse = { retention?: RetentionState; csrfToken?: string };

export function RetentionWorkspace({ clientId }: { clientId: string }) {
  const [retention, setRetention] = useState<RetentionState | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [reason, setReason] = useState("");
  const [releaseConfirmed, setReleaseConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/retention`, { credentials: "same-origin", cache: "no-store" });
      if (response.status === 404) throw new Error("This client record is not available to your account.");
      if (!response.ok) throw new Error(await responseMessage(response, "Retention information is unavailable."));
      const body = await response.json() as RetentionResponse;
      if (!body.retention || !body.csrfToken) throw new Error("The secure retention workspace could not be loaded.");
      setRetention(body.retention);
      setCsrfToken(body.csrfToken);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Retention information is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [clientId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!retention || !csrfToken) return;
    const action = retention.retentionHold ? "release" : "hold";
    if (action === "release" && !releaseConfirmed) {
      setError("Confirm the explicit legal-hold release before continuing.");
      return;
    }
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/retention`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason, revision: retention.revision, csrfToken }),
      });
      if (response.status === 409) {
        await load();
        throw new Error("This client record changed elsewhere. The retention state was reloaded; review it before trying again.");
      }
      if (!response.ok) throw new Error(await responseMessage(response, "The legal-hold action could not be saved."));
      const body = await response.json() as RetentionResponse;
      if (!body.retention || !body.csrfToken) throw new Error("The server did not confirm the legal-hold action.");
      setRetention((current) => current ? { ...current, retentionHold: body.retention!.retentionHold, revision: body.retention!.revision } : body.retention!);
      setCsrfToken(body.csrfToken);
      setReason("");
      setReleaseConfirmed(false);
      setNotice(action === "hold" ? "Legal hold placed. No records were deleted." : "Legal hold released. No records were deleted.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The legal-hold action could not be saved.");
    } finally {
      setWorking(false);
    }
  }

  if (loading) return <section className="card"><p className="muted" aria-live="polite">Loading retention controls…</p></section>;
  if (error && !retention) return <section className="card"><p className="error" role="alert">{error}</p><button className="button button-secondary" type="button" onClick={() => void load()}>Retry</button></section>;
  if (!retention) return null;

  const placingHold = !retention.retentionHold;
  const retainUntil = retention.reportRetention.latestRetainUntil;
  return <section className="client-detail-workspace" aria-label="Retention and legal hold">
    <header className="workspace-header"><div><p className="eyebrow">Retention controls</p><h2>Record retention &amp; legal hold</h2><p className="muted">This preserves records. It does not delete, purge, or change an existing report’s retention date. Archived client records may also be placed on hold.</p></div><button className="button button-secondary" type="button" onClick={() => void load()} disabled={working}>Refresh</button></header>
    {(error || notice) && <p className={error ? "error" : "notice"} role={error ? "alert" : "status"}>{error || notice}</p>}

    <section className="card"><p className="eyebrow">Current state</p><h3 className="section-title">{retention.retentionHold ? "Legal hold active" : "No legal hold active"}</h3><p className="muted">{retention.retentionHold ? "Expiration or deletion work must stop for this client while the hold is active." : "A hold can be placed when records must be preserved for review."}</p><p className="muted">Report retention metadata: {retention.reportRetention.reportCount} report{retention.reportRetention.reportCount === 1 ? "" : "s"}; {retainUntil ? `latest retained-until date ${formatDate(retainUntil)}.` : "no report retention date recorded yet."}</p></section>

    <section className="card"><p className="eyebrow">{placingHold ? "Preservation action" : "Explicit release action"}</p><h3 className="section-title">{placingHold ? "Place legal hold" : "Release legal hold"}</h3><p className="muted">{placingHold ? "Provide the private operational reason for preserving this client record." : "Release only after an explicit review. Releasing a hold does not delete any record or shorten an immutable report retention date."}</p><form onSubmit={(event) => void submit(event)}>
      <label className="field"><span>{placingHold ? "Reason for placing legal hold" : "Reason for releasing legal hold"}</span><textarea className="input" value={reason} required maxLength={500} aria-describedby="retention-reason-limit" onChange={(event) => setReason(event.target.value)} /></label>
      <p className="muted" id="retention-reason-limit">{reason.length}/500 characters. The reason is stored privately and is not displayed in the general audit summary.</p>
      {!placingHold && <label className="field"><span><input type="checkbox" checked={releaseConfirmed} onChange={(event) => setReleaseConfirmed(event.target.checked)} /> I confirm that I am explicitly releasing this legal hold. This action does not delete any record.</span></label>}
      <div className="button-row"><button className={placingHold ? "button button-primary" : "button button-secondary"} type="submit" disabled={working || (!placingHold && !releaseConfirmed)}>{working ? "Saving…" : placingHold ? "Place legal hold — preserve this record" : "Release legal hold — no deletion"}</button></div>
    </form></section>

    <p className="muted">The proposed retention process remains pending owner approval. This workspace contains no deletion or purge control.</p>
  </section>;
}
