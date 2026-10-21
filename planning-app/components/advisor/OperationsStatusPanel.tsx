"use client";

import { RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDate, responseMessage } from "./api";

type OperationsConfiguration = {
  production: boolean;
  intakeAllowed: boolean;
  complianceApproved: boolean;
  storageVerified: boolean;
  encryptedStorageKeyConfigured: boolean;
  reportDownloadSigningConfigured: boolean;
  backupRestoreTestRecorded: boolean;
  retentionPolicyApproved: boolean;
  legalHoldProcessApproved: boolean;
  databaseConfigured: boolean;
  appOriginConfigured: boolean;
  runtimeConfigured: boolean;
  mailTokenConfigured: boolean;
  senderAttested: boolean;
  cronReplayProtectionAvailable: boolean;
};
type OperationsStatus = {
  checkedAt: string;
  operational: false;
  configuration: OperationsConfiguration;
  provider: { state: string; code: string; checkedAt: string };
  outbox: { pending: number | null; failed: number | null };
  blockers: string[];
};

const GATES: Array<{ key: keyof OperationsConfiguration; label: string }> = [
  { key: "production", label: "Production environment" },
  { key: "intakeAllowed", label: "Real-client intake gate" },
  { key: "complianceApproved", label: "Compliance approval recorded" },
  { key: "storageVerified", label: "Private storage verified" },
  { key: "encryptedStorageKeyConfigured", label: "Encryption key configured" },
  { key: "reportDownloadSigningConfigured", label: "Private report signing configured" },
  { key: "backupRestoreTestRecorded", label: "Restore test recorded" },
  { key: "retentionPolicyApproved", label: "Six-year retention policy approved" },
  { key: "legalHoldProcessApproved", label: "Legal-hold process approved" },
  { key: "databaseConfigured", label: "Database runtime configured" },
  { key: "appOriginConfigured", label: "HTTPS app origin configured" },
  { key: "runtimeConfigured", label: "Hostinger runtime configured" },
  { key: "mailTokenConfigured", label: "Mail API token configured" },
  { key: "senderAttested", label: "Sender verification attested" },
  { key: "cronReplayProtectionAvailable", label: "Durable cron replay protection" },
];

async function errorFor(response: Response, fallback: string): Promise<Error> {
  if (response.status === 401) return new Error("Your advisor session has expired. Sign in again, then retry.");
  return new Error(await responseMessage(response, fallback));
}

export function OperationsStatusPanel() {
  const [status, setStatus] = useState<OperationsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/operations/status", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw await errorFor(response, "Operations status is unavailable.");
      const body = await response.json() as { status: OperationsStatus };
      setStatus(body.status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Operations status is unavailable. Try again.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  if (loading) return <section className="card operations-status"><p className="muted" aria-live="polite">Loading redacted operations readiness…</p></section>;
  if (!status) return <section className="card operations-status"><p className="error" role="alert">{error || "Operations status is unavailable."}</p><button className="button button-secondary" type="button" onClick={() => void load()}><RefreshCw aria-hidden="true" />Try again</button></section>;

  return <section className="card operations-status">
    <header className="workspace-header"><div><p className="eyebrow">Read-only safeguards</p><h2 className="section-title">Operations readiness</h2><p className="muted">This status intentionally does not claim that production operations are active. It reports the currently observed, redacted configuration gates and blockers only.</p></div><button className="button button-secondary" type="button" onClick={() => void load()} disabled={loading}><RefreshCw aria-hidden="true" />Refresh status</button></header>
    <p className="notice"><ShieldAlert aria-hidden="true" />Operational claim: <strong>not asserted</strong>. There is no activation control in this workspace because verification cannot be simulated from the UI.</p>
    <div className="review-grid operations-summary"><div className="review-item"><small>Status checked</small><strong>{formatDate(status.checkedAt)}</strong></div><div className="review-item"><small>Mail metadata</small><strong>{status.provider.state} · {status.provider.code}</strong><small>Checked {formatDate(status.provider.checkedAt)}</small></div><div className="review-item"><small>Outbox pending</small><strong>{status.outbox.pending === null ? "Unavailable" : status.outbox.pending}</strong></div><div className="review-item"><small>Outbox failed</small><strong>{status.outbox.failed === null ? "Unavailable" : status.outbox.failed}</strong></div></div>
    <h3>Configuration gates</h3><div className="table-wrap"><table><thead><tr><th>Gate</th><th>Observed state</th></tr></thead><tbody>{GATES.map((gate) => <tr key={gate.key}><td>{gate.label}</td><td><span className={status.configuration[gate.key] ? "success" : "error"}>{status.configuration[gate.key] ? "Configured / recorded" : "Not configured / not recorded"}</span></td></tr>)}</tbody></table></div>
    <h3>Current blockers</h3>{status.blockers.length ? <ul className="operations-blockers">{status.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <p className="notice">No blockers were returned at this check. This remains a readiness view, not a declaration that production operations are active.</p>}
  </section>;
}
