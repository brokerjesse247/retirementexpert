"use client";

import { RefreshCw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  renderDonutChartSvg,
  renderFanChartSvg,
  renderLineChartSvg,
  type ChartPoint,
  type ChartSlice,
} from "@/lib/reports/charts";
import { responseMessage } from "./api";

type UnknownRecord = Record<string, unknown>;
type AnalysisOverrides = {
  primaryClaimAge?: number;
  spouseClaimAge?: number;
  primaryPlanningAge?: number;
  spousePlanningAge?: number;
  essentialMonthlySpending?: number;
  healthcareIncludedInSpending?: boolean;
  primaryIraDestination?: "TRAD_IRA" | "ROTH_IRA";
  spouseIraDestination?: "TRAD_IRA" | "ROTH_IRA";
  historicalMagi?: Record<string, number>;
  spouseLivedTogetherForMfs?: boolean;
};
type Snapshot = {
  input: UnknownRecord;
  assumptions: UnknownRecord;
  results: UnknownRecord;
  warnings: string[];
  meta: {
    engineVersion?: string;
    assumptionsVersion?: string;
    inputRevision?: number;
    seed?: number;
    capturedAt?: string;
  };
};
type AnalysisResponse = { id: string; snapshot: Snapshot; overrides: AnalysisOverrides; csrfToken: string };
type OverrideForm = {
  primaryClaimAge: string;
  spouseClaimAge: string;
  primaryPlanningAge: string;
  spousePlanningAge: string;
  essentialMonthlySpending: string;
  healthcareIncludedInSpending: "" | "true" | "false";
  primaryIraDestination: "" | "TRAD_IRA" | "ROTH_IRA";
  spouseIraDestination: "" | "TRAD_IRA" | "ROTH_IRA";
  magi: Record<string, string>;
  spouseLivedTogetherForMfs: "" | "true" | "false";
};

const EMPTY_FORM: OverrideForm = {
  primaryClaimAge: "", spouseClaimAge: "", primaryPlanningAge: "", spousePlanningAge: "", essentialMonthlySpending: "",
  healthcareIncludedInSpending: "", primaryIraDestination: "", spouseIraDestination: "", magi: {}, spouseLivedTogetherForMfs: "",
};

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function recordAt(value: unknown, path: string): UnknownRecord | null {
  const current = valueAt(value, path);
  return isRecord(current) ? current : null;
}
function valueAt(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const part of path.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}
function numberAt(value: unknown, path: string): number | null {
  const candidate = valueAt(value, path);
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}
function stringAt(value: unknown, path: string): string | null {
  const candidate = valueAt(value, path);
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}
function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function moduleResult(results: UnknownRecord, key: string): UnknownRecord | null {
  return recordAt(results, key);
}
function moduleStatus(result: UnknownRecord | null): "COMPLETE" | "PARTIAL" | "UNSUPPORTED" | "UNKNOWN" {
  const status = stringAt(result, "meta.status") ?? stringAt(result, "status");
  return status === "COMPLETE" || status === "PARTIAL" || status === "UNSUPPORTED" ? status : "UNKNOWN";
}
function moduleWarnings(result: UnknownRecord | null): string[] {
  const list = valueAt(result, "meta.warnings") ?? valueAt(result, "warnings");
  return Array.isArray(list) ? list.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}
function money(value: number | null): string {
  return value === null ? "Not available" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
function percentage(value: number | null, unit: 'PERCENT' | 'RATIO' = 'PERCENT'): string {
  return value === null ? "Not available" : `${(unit === 'RATIO' ? value * 100 : value).toFixed(1)}%`;
}
function score(value: number | null): string {
  return value === null ? "Needs inputs" : `${value.toFixed(1)} / 100`;
}
function statusLabel(status: ReturnType<typeof moduleStatus>): string {
  return status === "COMPLETE" ? "Complete" : status === "PARTIAL" ? "Partial — review warnings" : status === "UNSUPPORTED" ? "Unsupported" : "Unknown availability";
}
function statusClass(status: ReturnType<typeof moduleStatus>): string {
  return status === "COMPLETE" ? "success" : status === "PARTIAL" ? "notice" : "error";
}
function asForm(overrides: AnalysisOverrides): OverrideForm {
  const magi = Object.fromEntries(Object.entries(overrides.historicalMagi ?? {}).map(([year, value]) => [year, String(value)]));
  return {
    primaryClaimAge: overrides.primaryClaimAge === undefined ? "" : String(overrides.primaryClaimAge),
    spouseClaimAge: overrides.spouseClaimAge === undefined ? "" : String(overrides.spouseClaimAge),
    primaryPlanningAge: overrides.primaryPlanningAge === undefined ? "" : String(overrides.primaryPlanningAge),
    spousePlanningAge: overrides.spousePlanningAge === undefined ? "" : String(overrides.spousePlanningAge),
    essentialMonthlySpending: overrides.essentialMonthlySpending === undefined ? "" : String(overrides.essentialMonthlySpending),
    healthcareIncludedInSpending: overrides.healthcareIncludedInSpending === undefined ? "" : String(overrides.healthcareIncludedInSpending) as "true" | "false",
    primaryIraDestination: overrides.primaryIraDestination ?? "",
    spouseIraDestination: overrides.spouseIraDestination ?? "",
    magi,
    spouseLivedTogetherForMfs: overrides.spouseLivedTogetherForMfs === undefined ? "" : String(overrides.spouseLivedTogetherForMfs) as "true" | "false",
  };
}
function optionalNumber(value: string, label: string, min: number, max: number, integer = false): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) {
    throw new Error(`${label} must be ${integer ? "a whole number " : ""}between ${min.toLocaleString()} and ${max.toLocaleString()}.`);
  }
  return parsed;
}
function buildOverrides(form: OverrideForm): AnalysisOverrides {
  const overrides: AnalysisOverrides = {};
  const primaryClaimAge = optionalNumber(form.primaryClaimAge, "Primary claiming age", 62, 70, true);
  const spouseClaimAge = optionalNumber(form.spouseClaimAge, "Spouse claiming age", 62, 70, true);
  const primaryPlanningAge = optionalNumber(form.primaryPlanningAge, "Primary planning age", 80, 110, true);
  const spousePlanningAge = optionalNumber(form.spousePlanningAge, "Spouse planning age", 80, 110, true);
  const essentialMonthlySpending = optionalNumber(form.essentialMonthlySpending, "Essential monthly spending", 0, 100_000_000);
  if (primaryClaimAge !== undefined) overrides.primaryClaimAge = primaryClaimAge;
  if (spouseClaimAge !== undefined) overrides.spouseClaimAge = spouseClaimAge;
  if (primaryPlanningAge !== undefined) overrides.primaryPlanningAge = primaryPlanningAge;
  if (spousePlanningAge !== undefined) overrides.spousePlanningAge = spousePlanningAge;
  if (essentialMonthlySpending !== undefined) overrides.essentialMonthlySpending = essentialMonthlySpending;
  if (form.healthcareIncludedInSpending) overrides.healthcareIncludedInSpending = form.healthcareIncludedInSpending === "true";
  if (form.primaryIraDestination) overrides.primaryIraDestination = form.primaryIraDestination;
  if (form.spouseIraDestination) overrides.spouseIraDestination = form.spouseIraDestination;
  if (form.spouseLivedTogetherForMfs) overrides.spouseLivedTogetherForMfs = form.spouseLivedTogetherForMfs === "true";
  const historicalMagi = Object.fromEntries(Object.entries(form.magi).flatMap(([year, raw]) => {
    const value = optionalNumber(raw, `Historical MAGI for ${year}`, 0, 1_000_000_000_000);
    return value === undefined ? [] : [[year, value] as const];
  }));
  if (Object.keys(historicalMagi).length) overrides.historicalMagi = historicalMagi;
  return overrides;
}
async function errorFor(response: Response, fallback: string): Promise<Error> {
  if (response.status === 401) return new Error("Your advisor session has expired. Sign in again, then retry.");
  return new Error(await responseMessage(response, fallback));
}

export function AnalysisWorkspace({ clientId }: { clientId: string }) {
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [form, setForm] = useState<OverrideForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/analysis`, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw await errorFor(response, "Analysis is unavailable. Check the intake and try again.");
      const body = await response.json() as AnalysisResponse;
      setAnalysis(body); setForm(asForm(body.overrides));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analysis is unavailable. Try again.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [clientId]);

  async function saveOverrides() {
    if (!analysis) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const overrides = buildOverrides(form);
      const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/analysis`, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides, revision: analysis.snapshot.meta.inputRevision, csrfToken: analysis.csrfToken }),
      });
      if (response.status === 409) throw new Error("The client record changed elsewhere. Reload this analysis before saving optional planning inputs.");
      if (!response.ok) throw await errorFor(response, "Optional planning inputs could not be saved.");
      const body = await response.json() as AnalysisResponse;
      setAnalysis(body); setForm(asForm(body.overrides));
      setNotice("Optional planning inputs saved and analysis recalculated. The submitted intake was not changed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Optional planning inputs could not be saved.");
    } finally { setSaving(false); }
  }

  const view = useMemo(() => {
    if (!analysis) return null;
    const results = analysis.snapshot.results;
    const netWorth = moduleResult(results, "netWorth");
    const cashFlow = moduleResult(results, "cashFlow");
    const monteCarlo = moduleResult(results, "monteCarlo");
    const readiness = moduleResult(results, "readiness");
    const taxes = moduleResult(results, "taxes");
    const rows = records(valueAt(cashFlow, "rows"));
    const firstRetirementRow = rows.find((row) => numberAt(row, "year") === numberAt(cashFlow, "retirementYear")) ?? rows[0] ?? null;
    const fanRows = records(valueAt(monteCarlo, "fanChart"));
    const warnings = [...analysis.snapshot.warnings, ...Object.entries(results).flatMap(([name, result]) => moduleWarnings(isRecord(result) ? result : null).map((warning) => `${name}: ${warning}`))]
      .filter((item, index, all) => Boolean(item.trim()) && all.indexOf(item) === index);
    const buckets: ChartSlice[] = [
      { label: "Taxable", value: numberAt(netWorth, "taxable") },
      { label: "Tax-deferred", value: numberAt(netWorth, "taxDeferred") },
      { label: "Tax-free", value: numberAt(netWorth, "taxFree") },
    ];
    const fan: ChartPoint[] = fanRows.map((row, index) => ({
      label: String(valueAt(row, "year") ?? valueAt(row, "age") ?? index + 1), lower: numberAt(row, "p10"), value: numberAt(row, "median"), upper: numberAt(row, "p90"),
    }));
    const principal: ChartPoint[] = rows.map((row, index) => ({ label: String(valueAt(row, "year") ?? index + 1), value: numberAt(row, "endingBalance") }));
    const tax: ChartPoint[] = rows.map((row, index) => ({ label: String(valueAt(row, "year") ?? index + 1), value: numberAt(row, "federalTax") }));
    const sourceRecords = [
      ...records(valueAt(analysis.snapshot.assumptions, "sources")),
      ...records(valueAt(analysis.snapshot.assumptions, "annual.sources")),
    ];
    return { netWorth, cashFlow, monteCarlo, readiness, taxes, firstRetirementRow, warnings, buckets, fan, principal, tax, sourceRecords };
  }, [analysis]);

  if (loading) return <section className="card loading-card"><p className="muted" aria-live="polite">Loading saved analysis and reproducibility details…</p></section>;
  if (!analysis || !view) return <section className="card"><p className="error" role="alert">{error || "Analysis is unavailable."}</p><button className="button button-secondary" type="button" onClick={() => void load()}><RefreshCw aria-hidden="true" />Try again</button></section>;

  const { snapshot } = analysis;
  const readinessScore = numberAt(view.readiness, "score");
  const monteCarloSuccess = numberAt(view.monteCarlo, "successPercent");
  const cashStatus = moduleStatus(view.cashFlow);
  const depletion = numberAt(view.cashFlow, "depletionAge");
  const historicalYears = Array.from(new Set(["2024", "2025", ...Object.keys(form.magi)])).sort();

  return <section className="analysis-workspace">
    <header className="workspace-header"><div><p className="eyebrow">Saved calculation snapshot</p><h2 className="section-title">Analysis</h2><p className="muted">Results reflect the current saved intake plus explicitly saved optional planning inputs. They are not advice or a guarantee.</p></div><button className="button button-secondary" type="button" onClick={() => void load()} disabled={loading}><RefreshCw aria-hidden="true" />Refresh analysis</button></header>
    {(error || notice) && <p className={error ? "error-banner" : "notice"} role={error ? "alert" : "status"}>{error || notice}</p>}

    <section className="kpi-grid analysis-kpi-grid" aria-label="Analysis overview">
      <article className="kpi-card"><span>Readiness score</span><strong>{score(readinessScore)}</strong><small>{readinessScore === null ? "Required components are unknown or partial." : statusLabel(moduleStatus(view.readiness))}</small></article>
      <article className="kpi-card"><span>Monte Carlo success</span><strong>{percentage(monteCarloSuccess)}</strong><small>{statusLabel(moduleStatus(view.monteCarlo))}</small></article>
      <article className="kpi-card"><span>Net worth</span><strong>{money(numberAt(view.netWorth, "netWorth"))}</strong><small>{statusLabel(moduleStatus(view.netWorth))}</small></article>
      <article className="kpi-card"><span>Retirement assets</span><strong>{money(numberAt(view.cashFlow, "portfolioAtRetirement"))}</strong><small>Cash-flow projection at retirement</small></article>
    </section>

    <section className="kpi-grid analysis-kpi-grid" aria-label="Income, depletion, and tax overview">
      <article className="kpi-card"><span>Portfolio income gap</span><strong>{money(numberAt(view.firstRetirementRow, "portfolioNeed"))}</strong><small>Annual net funding needed from the portfolio, including any unfunded shortfall.</small></article>
      <article className="kpi-card"><span>Income coverage</span><strong>{percentage(numberAt(view.cashFlow, "incomeCoverageRatio"), "RATIO")}</strong><small>Essential-spending coverage is unavailable when that input is unknown.</small></article>
      <article className="kpi-card"><span>Depletion</span><strong>{depletion === null ? cashStatus === "COMPLETE" ? "Not in horizon" : "Not available" : `Age ${depletion.toFixed(1)}`}</strong><small>{cashStatus === "COMPLETE" ? "Cash-flow projection result" : statusLabel(cashStatus)}</small></article>
      <article className="kpi-card"><span>Federal tax</span><strong>{money(numberAt(view.taxes, "current.federalTax"))}</strong><small>Current supplied tax result · lifetime {money(numberAt(view.cashFlow, "lifetimeFederalTax"))}</small></article>
    </section>

    {view.warnings.length > 0 && <section className="card analysis-warnings" aria-labelledby="analysis-warnings-title"><p className="eyebrow">Data limits</p><h3 id="analysis-warnings-title">Unknown and partial inputs require review</h3><p className="muted">A blank or partial calculation is not treated as zero. Review these saved engine and input warnings before relying on the displayed values.</p><ul>{view.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></section>}

    <section className="analysis-chart-grid">
      <article className="card"><p className="eyebrow">Readiness</p><h3>Saved readiness score</h3><p className="kpi-value">{score(readinessScore)}</p><p className="muted">{statusLabel(moduleStatus(view.readiness))}. A null score means inputs or components are incomplete, not a score of zero.</p></article>
      <article className="card"><p className="eyebrow">Tax buckets</p><h3>Current investable tax mix</h3><div className="analysis-svg" dangerouslySetInnerHTML={{ __html: renderDonutChartSvg(view.buckets, { title: "Tax bucket balances" }) }} /><p className="muted">Only supplied net-worth results are charted.</p></article>
      <article className="card"><p className="eyebrow">Monte Carlo</p><h3>Percentile fan</h3><div className="analysis-svg" dangerouslySetInnerHTML={{ __html: renderFanChartSvg(view.fan, { title: "Monte Carlo percentile fan" }) }} /><p className="muted">{statusLabel(moduleStatus(view.monteCarlo))}; success {percentage(monteCarloSuccess)}.</p></article>
      <article className="card"><p className="eyebrow">Principal</p><h3>Projected ending balance</h3><div className="analysis-svg" dangerouslySetInnerHTML={{ __html: renderLineChartSvg(view.principal, { title: "Projected ending balance", valueLabel: (value) => money(value) }) }} /><p className="muted">Cash-flow ending balance by supplied projection year.</p></article>
      <article className="card"><p className="eyebrow">Tax</p><h3>Projected federal tax</h3><div className="analysis-svg" dangerouslySetInnerHTML={{ __html: renderLineChartSvg(view.tax, { title: "Projected federal tax", valueLabel: (value) => money(value) }) }} /><p className="muted">Federal tax by supplied cash-flow projection year.</p></article>
    </section>

    <section className="card analysis-overrides"><p className="eyebrow">Optional analysis inputs</p><h3>Model clarifications — not intake edits</h3><p className="muted">Leave a field blank to use the submitted intake or the model default. Saving these controls never changes the client’s saved intake; it records only scenario overrides.</p>
      <div className="form-grid">
        <label className="field"><span className="field-label">Primary Social Security claiming age</span><input className="input" type="number" min="62" max="70" value={form.primaryClaimAge} onChange={(event) => setForm((current) => ({ ...current, primaryClaimAge: event.target.value }))} /><small>Optional, 62–70.</small></label>
        <label className="field"><span className="field-label">Spouse Social Security claiming age</span><input className="input" type="number" min="62" max="70" value={form.spouseClaimAge} onChange={(event) => setForm((current) => ({ ...current, spouseClaimAge: event.target.value }))} /><small>Optional, 62–70.</small></label>
        <label className="field"><span className="field-label">Primary planning age</span><input className="input" type="number" min="80" max="110" value={form.primaryPlanningAge} onChange={(event) => setForm((current) => ({ ...current, primaryPlanningAge: event.target.value }))} /><small>Optional, 80–110.</small></label>
        <label className="field"><span className="field-label">Spouse planning age</span><input className="input" type="number" min="80" max="110" value={form.spousePlanningAge} onChange={(event) => setForm((current) => ({ ...current, spousePlanningAge: event.target.value }))} /><small>Optional, 80–110.</small></label>
        <label className="field"><span className="field-label">Essential monthly spending</span><input className="input" type="number" min="0" step="0.01" value={form.essentialMonthlySpending} onChange={(event) => setForm((current) => ({ ...current, essentialMonthlySpending: event.target.value }))} /><small>Optional. Needed to calculate essential-income coverage.</small></label>
        <label className="field"><span className="field-label">Healthcare included in retirement spending?</span><select className="input" value={form.healthcareIncludedInSpending} onChange={(event) => setForm((current) => ({ ...current, healthcareIncludedInSpending: event.target.value as OverrideForm["healthcareIncludedInSpending"] }))}><option value="">Use analysis baseline</option><option value="true">Yes, already included</option><option value="false">No, modeled separately</option></select><small>Confirm to avoid double-counting healthcare costs.</small></label>
        <label className="field"><span className="field-label">Primary combined IRA contribution destination</span><select className="input" value={form.primaryIraDestination} onChange={(event) => setForm((current) => ({ ...current, primaryIraDestination: event.target.value as OverrideForm["primaryIraDestination"] }))}><option value="">Not specified</option><option value="TRAD_IRA">Traditional IRA</option><option value="ROTH_IRA">Roth IRA</option></select></label>
        <label className="field"><span className="field-label">Spouse combined IRA contribution destination</span><select className="input" value={form.spouseIraDestination} onChange={(event) => setForm((current) => ({ ...current, spouseIraDestination: event.target.value as OverrideForm["spouseIraDestination"] }))}><option value="">Not specified</option><option value="TRAD_IRA">Traditional IRA</option><option value="ROTH_IRA">Roth IRA</option></select></label>
        <label className="field"><span className="field-label">MFS spouses lived together?</span><select className="input" value={form.spouseLivedTogetherForMfs} onChange={(event) => setForm((current) => ({ ...current, spouseLivedTogetherForMfs: event.target.value as OverrideForm["spouseLivedTogetherForMfs"] }))}><option value="">Not confirmed</option><option value="true">Yes</option><option value="false">No</option></select><small>Only relevant to married filing separately tax and Medicare rules.</small></label>
      </div>
      <div className="profile-step"><h4>Historical MAGI (optional)</h4><p className="muted">Used for Medicare IRMAA lookback when supplied. Empty years are not saved.</p><div className="form-grid">{historicalYears.map((year) => <label className="field" key={year}><span className="field-label">{year} MAGI</span><input className="input" type="number" min="0" step="0.01" value={form.magi[year] ?? ""} onChange={(event) => setForm((current) => ({ ...current, magi: { ...current.magi, [year]: event.target.value } }))} /></label>)}</div></div>
      <div className="form-actions"><button className="button button-primary" type="button" onClick={() => void saveOverrides()} disabled={saving}><Save aria-hidden="true" />{saving ? "Saving and recalculating…" : "Save optional inputs"}</button><button className="button button-secondary" type="button" onClick={() => setForm(asForm(analysis.overrides))} disabled={saving}>Discard unsaved changes</button></div>
    </section>

    <section className="card analysis-lineage"><p className="eyebrow">Snapshot lineage</p><h3>Reproducibility and sources</h3><div className="review-grid"><div className="review-item"><small>Engine version</small><strong>{snapshot.meta.engineVersion || "Not supplied"}</strong></div><div className="review-item"><small>Assumptions version / year</small><strong>{snapshot.meta.assumptionsVersion || stringAt(snapshot.assumptions, "version") || "Not supplied"} · {numberAt(snapshot.assumptions, "year") ?? "Not supplied"}</strong></div><div className="review-item"><small>Monte Carlo seed</small><strong>{snapshot.meta.seed ?? "Not supplied"}</strong></div><div className="review-item"><small>Captured timestamp</small><strong>{snapshot.meta.capturedAt || "Not supplied"}</strong></div><div className="review-item"><small>Input revision</small><strong>{snapshot.meta.inputRevision ?? "Not supplied"}</strong></div><div className="review-item"><small>Analysis ID</small><strong>{analysis.id}</strong></div></div>
      <details open><summary>Sources and classifications ({view.sourceRecords.length})</summary>{view.sourceRecords.length ? <div className="table-wrap"><table><thead><tr><th>Key</th><th>Classification</th><th>Verified</th><th>Source</th></tr></thead><tbody>{view.sourceRecords.map((source, index) => <tr key={`${stringAt(source, "key") ?? index}-${stringAt(source, "url") ?? ""}`}><td>{stringAt(source, "key") || "Not supplied"}</td><td>{stringAt(source, "classification") || "Not supplied"}</td><td>{stringAt(source, "verifiedAt") || "Not supplied"}</td><td>{stringAt(source, "url") ? <a href={stringAt(source, "url") ?? "#"} target="_blank" rel="noreferrer">{stringAt(source, "title") || "Open source"}</a> : "Not supplied"}</td></tr>)}</tbody></table></div> : <p className="muted">No source records were supplied with this snapshot.</p>}</details>
    </section>
  </section>;
}
