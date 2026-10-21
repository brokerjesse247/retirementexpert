"use client";

import { Archive, BarChart3, Copy, Plus, RefreshCw, RotateCcw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { responseMessage } from "./api";

type ScenarioOverrides = Record<string, unknown>;
type Scenario = {
  id: string;
  name: string;
  isBase: boolean;
  status: "DRAFT" | "ARCHIVED";
  revision: number;
  createdAt: string;
  updatedAt: string;
  overrides: ScenarioOverrides;
  lineage: { sourceScenarioId: string; sourceScenarioRevision: number } | null;
};
type Metric = { value: number | null; unit: "PERCENT" | "USD" | "USD_PER_YEAR"; availability: "AVAILABLE" | "UNAVAILABLE"; note?: string };
type Comparison = { scenarios: Array<{ scenarioId: string; scenarioName: string; name: string; analysisId: string; metrics: Record<string, Metric> }>; limit: 3 };
type AnalysisResponse = { scenario: Scenario; id: string; scenarioName: string; name: string; snapshot: { warnings: string[]; results: Record<string, unknown>; meta: { scenario?: { revision?: number; options?: unknown; sourceLineage?: unknown }; seed?: number; capturedAt?: string } }; csrfToken: string };

function money(value: number | null): string {
  return typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value) : "Not available";
}
function metricValue(metric: Metric | undefined): string {
  if (!metric || metric.availability === "UNAVAILABLE" || metric.value === null) return "Not available";
  if (metric.unit === "PERCENT") return `${metric.value.toFixed(1)}%`;
  return money(metric.value);
}
function metricLabel(metric: Metric | undefined): string {
  if (!metric) return "Not available";
  if (metric.unit === "PERCENT") return "Percent";
  return metric.unit === "USD_PER_YEAR" ? "USD / year" : "USD";
}
function parseOverrides(value: string): ScenarioOverrides {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error("Scenario inputs must be valid JSON."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Scenario inputs must be a JSON object.");
  return parsed as ScenarioOverrides;
}
async function errorFor(response: Response, fallback: string): Promise<Error> {
  if (response.status === 401) return new Error("Your advisor session has expired. Sign in again, then retry.");
  return new Error(await responseMessage(response, fallback));
}

/**
 * Saved scenario controls deliberately submit the strict server contract as JSON.
 * The examples show unit conventions without converting or silently dropping any
 * advanced field, account replacement, LTC event, or annuity purchase.
 */
export function ScenariosWorkspace({ clientId }: { clientId: string }) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [csrfToken, setCsrfToken] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [overrideText, setOverrideText] = useState("{}");
  const [newName, setNewName] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selected = useMemo(() => scenarios.find((scenario) => scenario.id === selectedId) ?? null, [scenarios, selectedId]);
  const activeScenarios = useMemo(() => scenarios.filter((scenario) => scenario.status === "DRAFT"), [scenarios]);

  async function loadList() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/scenarios`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw await errorFor(response, "Scenarios are unavailable.");
      const body = await response.json() as { scenarios: Scenario[]; csrfToken: string };
      setScenarios(body.scenarios); setCsrfToken(body.csrfToken);
      setChosen((current) => current.filter((id) => body.scenarios.some((scenario) => scenario.id === id && scenario.status === "DRAFT")).slice(0, 3));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Scenarios are unavailable."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadList(); }, [clientId]);

  async function selectScenario(scenario: Scenario) {
    setSelectedId(scenario.id); setName(scenario.name); setOverrideText(JSON.stringify(scenario.overrides, null, 2)); setAnalysis(null); setError(""); setNotice("");
    if (scenario.status === "ARCHIVED") return;
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/scenarios/${encodeURIComponent(scenario.id)}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw await errorFor(response, "Scenario analysis is unavailable.");
      const body = await response.json() as AnalysisResponse;
      setAnalysis(body); setCsrfToken(body.csrfToken);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Scenario analysis is unavailable."); }
  }

  async function create() {
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/scenarios`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, overrides: parseOverrides(overrideText), csrfToken }),
      });
      if (!response.ok) throw await errorFor(response, "Scenario could not be saved.");
      const body = await response.json() as { scenario: Scenario; csrfToken: string };
      setCsrfToken(body.csrfToken); setNewName(""); setNotice("Scenario saved. Its inputs are isolated from the Base plan.");
      await loadList(); await selectScenario(body.scenario);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Scenario could not be saved."); }
    finally { setSaving(false); }
  }
  async function save() {
    if (!selected || selected.isBase) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/scenarios/${encodeURIComponent(selected.id)}`, {
        method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, overrides: parseOverrides(overrideText), revision: selected.revision, csrfToken }),
      });
      if (response.status === 409) throw new Error("This scenario changed elsewhere. Reload it before saving.");
      if (!response.ok) throw await errorFor(response, "Scenario changes could not be saved.");
      const body = await response.json() as { scenario: Scenario; csrfToken: string };
      setCsrfToken(body.csrfToken); setNotice("Scenario saved. Re-open or compare it to calculate the new effective inputs.");
      await loadList(); await selectScenario(body.scenario);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Scenario changes could not be saved."); }
    finally { setSaving(false); }
  }
  async function action(action: "duplicate" | "reset" | "archive") {
    if (!selected || (selected.isBase && action !== "duplicate")) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/scenarios/${encodeURIComponent(selected.id)}/${action}`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "duplicate" ? { csrfToken } : { revision: selected.revision, csrfToken }),
      });
      if (response.status === 409) throw new Error("This scenario changed elsewhere. Reload it before continuing.");
      if (!response.ok) throw await errorFor(response, `Scenario could not be ${action}d.`);
      const body = await response.json() as { scenario: Scenario; csrfToken: string };
      setCsrfToken(body.csrfToken); setNotice(action === "duplicate" ? "Scenario duplicated with source lineage." : action === "reset" ? "Scenario inputs reset; its duplicate lineage is retained." : "Scenario archived. It cannot be recalculated or compared.");
      await loadList(); await selectScenario(body.scenario);
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Scenario could not be ${action}d.`); }
    finally { setSaving(false); }
  }
  function toggleChosen(id: string) {
    setError("");
    setChosen((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) { setError("Choose no more than three scenarios to compare."); return current; }
      return [...current, id];
    });
  }
  async function compare() {
    if (!chosen.length) { setError("Choose one to three scenarios to compare."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const query = chosen.map((id) => `id=${encodeURIComponent(id)}`).join("&");
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/scenarios/compare?${query}`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw await errorFor(response, "Scenario comparison is unavailable.");
      const body = await response.json() as Comparison & { csrfToken: string };
      setComparison({ scenarios: body.scenarios, limit: body.limit }); setCsrfToken(body.csrfToken);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Scenario comparison is unavailable."); }
    finally { setSaving(false); }
  }

  if (loading) return <section className="card loading-card"><p className="muted" aria-live="polite">Loading saved scenarios…</p></section>;
  return <section className="analysis-workspace">
    <header className="workspace-header"><div><p className="eyebrow">What-if planning</p><h2 className="section-title">Scenarios</h2><p className="muted">Alternate inputs are encrypted and isolated. Base-plan inputs and previously saved snapshots are never changed by a what-if.</p></div><button className="button button-secondary" type="button" onClick={() => void loadList()} disabled={saving}><RefreshCw aria-hidden="true" />Refresh</button></header>
    {(error || notice) && <p className={error ? "error-banner" : "notice"} role={error ? "alert" : "status"}>{error || notice}</p>}

    <section className="card"><p className="eyebrow">Create named what-if</p><h3>Supported inputs only</h3><p className="muted">Annual return and inflation are <strong>fractions</strong> in the saved JSON (for example, <code>0.055</code> is 5.5%). Dollar amounts are USD. Unsupported fields are rejected; no field is silently ignored.</p>
      <div className="form-grid"><label className="field"><span className="field-label">Scenario name</span><input className="input" value={newName} maxLength={180} onChange={(event) => setNewName(event.target.value)} placeholder="Earlier retirement" /></label></div>
      <label className="field"><span className="field-label">Scenario inputs</span><textarea className="input" rows={12} value={overrideText} onChange={(event) => setOverrideText(event.target.value)} spellCheck={false} aria-describedby="scenario-contract" /></label>
      <details id="scenario-contract"><summary>Supported JSON contract and limits</summary><pre>{`{
  "general": { "essentialMonthlySpending": 5000 },
  "people": { "PRIMARY": { "retirementAge": 65, "socialSecurityClaimAge": 67 } },
  "spending": { "retirementMonthly": 6500 },
  "returns": { "annualRate": 0.055, "returnByYear": { "2030": -0.10 } },
  "inflation": { "annualRate": 0.025 },
  "rothSchedule": { "2031": 25000 },
  "ltcEvent": { "person": "PRIMARY", "startAge": 82, "durationYears": 3, "monthlyCost": 9000 },
  "annuityPurchase": {
    "owner": "PRIMARY", "fundingAccount": { "owner": "PRIMARY", "type": "TRAD_IRA" },
    "premium": 100000, "monthlyIncome": 650, "startAge": 70, "taxQualification": "QUALIFIED"
  }
}`}</pre><p className="muted">An annuity needs an explicitly selected eligible account and advisor-supplied premium/income; the model does not quote, guarantee, or infer payout/tax treatment. LTC is one primary-person event and reaches actual cash flow and Monte Carlo.</p></details>
      <div className="form-actions"><button className="button button-primary" type="button" onClick={() => void create()} disabled={saving || !newName.trim()}><Plus aria-hidden="true" />{saving ? "Saving…" : "Save scenario"}</button></div>
    </section>

    <section className="card"><p className="eyebrow">Saved scenarios</p><h3>Choose up to three for comparison</h3>{scenarios.length === 0 ? <p className="muted">No scenario records are available.</p> : <div className="table-wrap"><table><thead><tr><th>Compare</th><th>Name</th><th>Status</th><th>Revision</th><th>Lineage</th><th>Action</th></tr></thead><tbody>{scenarios.map((scenario) => <tr key={scenario.id}><td><input type="checkbox" checked={chosen.includes(scenario.id)} disabled={scenario.status !== "DRAFT" || (!chosen.includes(scenario.id) && chosen.length >= 3)} onChange={() => toggleChosen(scenario.id)} aria-label={`Compare ${scenario.name}`} /></td><td>{scenario.name}{scenario.isBase ? " (Base)" : ""}</td><td>{scenario.status === "DRAFT" ? "Active" : "Archived"}</td><td>{scenario.revision}</td><td>{scenario.lineage ? `Copied from ${scenario.lineage.sourceScenarioId} at r${scenario.lineage.sourceScenarioRevision}` : "Original"}</td><td><button className="button button-secondary" type="button" onClick={() => void selectScenario(scenario)}>Open</button></td></tr>)}</tbody></table></div>}
      <div className="form-actions"><button className="button button-primary" type="button" onClick={() => void compare()} disabled={saving || chosen.length === 0}><BarChart3 aria-hidden="true" />Compare {chosen.length}/3</button></div>
    </section>

    {selected && <section className="card"><p className="eyebrow">{selected.isBase ? "Base plan" : "Selected scenario"}</p><h3>{selected.name}</h3>{selected.status === "ARCHIVED" ? <p className="notice">Archived scenarios retain their record but are not recalculated or compared. Duplicate to create an active copy.</p> : <><div className="form-grid"><label className="field"><span className="field-label">Scenario name</span><input className="input" value={name} maxLength={180} disabled={selected.isBase} onChange={(event) => setName(event.target.value)} /></label></div><label className="field"><span className="field-label">Saved inputs</span><textarea className="input" rows={14} value={overrideText} disabled={selected.isBase} onChange={(event) => setOverrideText(event.target.value)} spellCheck={false} /></label></>}
      {analysis && <div className="review-grid"><div className="review-item"><small>Scenario analysis</small><strong>{analysis.id}</strong></div><div className="review-item"><small>Monte Carlo seed</small><strong>{analysis.snapshot.meta.seed ?? "Not supplied"}</strong></div><div className="review-item"><small>Scenario revision in snapshot</small><strong>{analysis.snapshot.meta.scenario?.revision ?? "Not supplied"}</strong></div><div className="review-item"><small>Captured</small><strong>{analysis.snapshot.meta.capturedAt ?? "Not supplied"}</strong></div></div>}
      {analysis?.snapshot.warnings.length ? <details open><summary>Data limits and disclosures ({analysis.snapshot.warnings.length})</summary><ul>{analysis.snapshot.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details> : null}
      <div className="form-actions"><button className="button button-primary" type="button" onClick={() => void save()} disabled={saving || selected.isBase || selected.status !== "DRAFT"}><Save aria-hidden="true" />Save changes</button><button className="button button-secondary" type="button" onClick={() => void action("duplicate")} disabled={saving}><Copy aria-hidden="true" />Duplicate</button>{!selected.isBase && selected.status === "DRAFT" && <><button className="button button-secondary" type="button" onClick={() => void action("reset")} disabled={saving}><RotateCcw aria-hidden="true" />Reset inputs</button><button className="button button-secondary" type="button" onClick={() => void action("archive")} disabled={saving}><Archive aria-hidden="true" />Archive</button></>}</div>
    </section>}

    {comparison && <section className="card"><p className="eyebrow">Saved comparison</p><h3>Actual engine outputs</h3><p className="muted">Percentages are displayed as percentages; money is USD. “Not available” stays unavailable rather than being displayed as zero.</p><div className="table-wrap"><table><thead><tr><th>Scenario</th><th>Success</th><th>Lifetime tax</th><th>Median legacy</th><th>Retirement income</th></tr></thead><tbody>{comparison.scenarios.map((row) => <tr key={row.scenarioId}><td>{row.scenarioName}</td>{(["successPercent", "lifetimeTax", "medianLegacy", "retirementIncome"] as const).map((key) => <td key={key}><strong>{metricValue(row.metrics[key])}</strong><small className="muted">{metricLabel(row.metrics[key])}</small></td>)}</tr>)}</tbody></table></div><details><summary>Metric definitions</summary><ul>{comparison.scenarios[0] && Object.entries(comparison.scenarios[0].metrics).map(([key, value]) => <li key={key}><strong>{key}</strong>: {value.note ?? "No further definition supplied."}</li>)}</ul></details></section>}
  </section>;
}
