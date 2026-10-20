"use client";

import Link from "next/link";
import { ArrowRight, ClipboardCheck, FileText, RefreshCw, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { responseMessage } from "./api";

type Kpis = { newIntakes: number; inReview: number; reportsThisMonth: number; reviewsDue: number };
const empty: Kpis = { newIntakes: 0, inReview: 0, reportsThisMonth: 0, reviewsDue: 0 };

export function DashboardOverview() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/clients?sort=updatedAt_desc", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error(await responseMessage(response, "Dashboard data is unavailable."));
      const body = await response.json() as { kpis?: Kpis };
      setKpis(body.kpis || empty);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Dashboard data is unavailable."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const tiles = [
    { label: "New intakes", value: kpis?.newIntakes, icon: Users, href: "/dashboard/clients?status=NEW" },
    { label: "In review", value: kpis?.inReview, icon: ClipboardCheck, href: "/dashboard/clients?status=IN_REVIEW" },
    { label: "Reports this month", value: kpis?.reportsThisMonth, icon: FileText, href: "/dashboard/clients" },
    { label: "Reviews due", value: kpis?.reviewsDue, icon: RefreshCw, href: "/dashboard/clients?status=ANNUAL_REVIEW_DUE" },
  ];
  return <section className="dashboard-overview">
    <header className="workspace-header"><div><p className="eyebrow">Advisor workspace</p><h1>Overview</h1><p className="muted">A live view of your planning practice.</p></div><Link className="button button-primary" href="/dashboard/clients">View clients <ArrowRight aria-hidden="true" /></Link></header>
    {error ? <section className="card"><p className="error" role="alert">{error}</p><button className="button button-secondary" onClick={() => void load()}>Try again</button></section> : <div className="kpi-grid" aria-busy={loading}>
      {tiles.map(({ label, value, icon: Icon, href }) => <Link href={href} className="kpi-card" key={label}><Icon aria-hidden="true" /><span className="muted">{label}</span><strong>{loading ? "—" : value ?? 0}</strong><span className="muted">Open client list <ArrowRight aria-hidden="true" /></span></Link>)}
    </div>}
    <section className="card phase-card"><p className="eyebrow">Foundation status</p><h2 className="section-title">Intake records and profile review are available.</h2><p className="muted">Financial analysis, scenarios, recommendations, and reports are intentionally unavailable until their later delivery phases.</p></section>
  </section>;
}
