"use client";

import Link from "next/link";
import { ArrowUpDown, Download, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatDate, responseMessage, statusLabel } from "./api";
import type { ClientSummary } from "./types";

type ListResponse = { clients?: ClientSummary[] };
const statusOptions = ["", "NEW", "IN_REVIEW", "ANNUAL_REVIEW_DUE", "ARCHIVED"];

export function ClientsWorkspace({ initialSearch = "", initialStatus = "" }: { initialSearch?: string; initialStatus?: string }) {
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);
  const [sort, setSort] = useState("updatedAt_desc");
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const request = useMemo(() => new URLSearchParams({ ...(search ? { search } : {}), ...(status ? { status } : {}), sort }).toString(), [search, status, sort]);
  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/clients?${request}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error(await responseMessage(response, "Client records are unavailable."));
      const body = await response.json() as ListResponse;
      setClients(Array.isArray(body.clients) ? body.clients : []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Client records are unavailable."); }
    finally { setLoading(false); }
  }
  useEffect(() => { const id = window.setTimeout(() => void load(), 180); return () => window.clearTimeout(id); }, [request]); // debounce search and filters
  function exportCsv() { window.location.assign(`/api/clients/export?${new URLSearchParams({ ...(search ? { search } : {}), ...(status ? { status } : {}) }).toString()}`); }
  return <section className="clients-workspace">
    <header className="workspace-header"><div><p className="eyebrow">Advisor workspace</p><h1>Clients</h1><p className="muted">Submitted intake records available to your account.</p></div><button className="button button-secondary" onClick={exportCsv}><Download aria-hidden="true" />Export CSV</button></header>
    <section className="card client-filters table-toolbar" aria-label="Client filters">
      <label className="field search-field" aria-label="Search clients"><Search aria-hidden="true" /><input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" /></label>
      <label className="field"><span><SlidersHorizontal aria-hidden="true" /> Status</span><select className="input" value={status} onChange={(event) => setStatus(event.target.value)}>{statusOptions.map((option) => <option key={option} value={option}>{option ? statusLabel(option) : "All statuses"}</option>)}</select></label>
      <label className="field"><span><ArrowUpDown aria-hidden="true" /> Sort</span><select className="input" value={sort} onChange={(event) => setSort(event.target.value)}><option value="updatedAt_desc">Recently updated</option><option value="submittedAt_desc">Recently submitted</option><option value="submittedAt_asc">Oldest submitted</option><option value="name_asc">Name (A–Z)</option></select></label>
    </section>
    {error ? <section className="card"><p className="error" role="alert">{error}</p><button className="button button-secondary" onClick={() => void load()}>Try again</button></section> : loading ? <section className="card"><p className="muted" aria-live="polite">Loading client records…</p></section> : !clients?.length ? <section className="card empty-state"><p className="eyebrow">No matching records</p><h2 className="section-title">No submitted clients match these filters.</h2><p className="muted">New submitted intake records will appear here when they are available to your account.</p></section> : <div className="table-wrap"><table><thead><tr><th scope="col">Client</th><th scope="col">Age</th><th scope="col">Status</th><th scope="col">Submitted</th><th scope="col">Updated</th><th scope="col">Assets</th><th scope="col" aria-label="Open record" /></tr></thead><tbody>{clients.map((client) => <tr key={client.id}><td><strong>{client.name}</strong><span className="muted">{client.email}</span></td><td>{client.age ?? "—"}</td><td><span className="pill">{statusLabel(client.status)}</span></td><td>{formatDate(client.submittedAt)}</td><td>{formatDate(client.updatedAt)}</td><td>{formatCurrency(client.investableAssets)}</td><td><Link className="button button-secondary" aria-label={`Open ${client.name}`} href={`/dashboard/clients/${encodeURIComponent(client.id)}`}>Open</Link></td></tr>)}</tbody></table></div>}
  </section>;
}
