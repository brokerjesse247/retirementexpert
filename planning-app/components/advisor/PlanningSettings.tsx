"use client";

import { RefreshCw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  annualEditorSections,
  displayEditorValue,
  numericEdits,
  safeGet,
  type AnnualEditorSection,
  type FieldSpec,
  type UnknownRecord,
} from "../../lib/assumptions/editor-fields";
import { responseMessage } from "./api";

type Branding = { coverText: string; letter: string; additionalDisclosure: string; logoDataUrl?: string | null };
type BrandingResponse = { settings: Branding; requiredDisclosure: string; csrfToken: string };
type AssumptionsResponse = { assumptions: UnknownRecord; csrfToken: string };

const PLANNING_FIELDS: FieldSpec[] = [
  { path: "inflation", label: "General inflation", unit: "percent", factor: 100 },
  { path: "healthcareInflation", label: "Healthcare inflation", unit: "percent", factor: 100 },
  { path: "socialSecurityCola", label: "Social Security COLA", unit: "percent", factor: 100 },
  { path: "taxBracketInflation", label: "Tax-bracket inflation", unit: "percent", factor: 100 },
  { path: "targetTaxBracket", label: "Target tax bracket", unit: "percent", factor: 100 },
  { path: "heirsTaxRate", label: "Heirs tax-rate assumption", unit: "percent", factor: 100 },
  { path: "realDiscountRate", label: "Real discount rate", unit: "percent", factor: 100 },
  { path: "survivorSpendingPercent", label: "Survivor spending percentage", unit: "percent", factor: 100 },
  { path: "returnByRisk.CONSERVATIVE", label: "Conservative return", unit: "percent", factor: 100 },
  { path: "returnByRisk.MODERATE", label: "Moderate return", unit: "percent", factor: 100 },
  { path: "returnByRisk.AGGRESSIVE", label: "Aggressive return", unit: "percent", factor: 100 },
  { path: "volatilityByRisk.CONSERVATIVE", label: "Conservative volatility", unit: "percent", factor: 100 },
  { path: "volatilityByRisk.MODERATE", label: "Moderate volatility", unit: "percent", factor: 100 },
  { path: "volatilityByRisk.AGGRESSIVE", label: "Aggressive volatility", unit: "percent", factor: 100 },
  { path: "planningAgePoorHealth", label: "Planning age — poor health", unit: "years" },
  { path: "planningAgeDefault", label: "Planning age — default", unit: "years" },
  { path: "planningAgeExcellentLongevity", label: "Planning age — excellent longevity", unit: "years" },
  { path: "monteCarloRuns", label: "Monte Carlo runs", unit: "runs" },
  { path: "monteCarloSeed", label: "Monte Carlo seed", unit: "seed" },
  { path: "monteCarloTarget", label: "Monte Carlo target", unit: "percent", factor: 100 },
  { path: "preMedicareMonthly", label: "Pre-Medicare cost", unit: "USD per month" },
  { path: "supplementalMedicareMonthly", label: "Supplemental Medicare cost", unit: "USD per month" },
  { path: "medicalOutOfPocketAnnual", label: "Medical out-of-pocket cost", unit: "USD per year" },
  { path: "ltcMonthly", label: "Long-term-care cost", unit: "USD per month" },
  { path: "ltcYears", label: "Long-term-care duration", unit: "years" },
  { path: "ltcEventAge", label: "Long-term-care event age", unit: "years" },
  { path: "stateTaxRate", label: "State tax rate", unit: "percent", factor: 100, nullable: true, help: "Leave blank when state income tax is not modeled." },
  { path: "stateEstateThreshold", label: "State estate threshold", unit: "USD", nullable: true, help: "Leave blank when state estate tax is not modeled." },
  { path: "finalExpenses", label: "Final expenses", unit: "USD" },
  { path: "incomeReplacementYears", label: "Income replacement period", unit: "years" },
];

function isRecord(value: unknown): value is UnknownRecord { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function records(value: unknown): UnknownRecord[] { return Array.isArray(value) ? value.filter(isRecord) : []; }
function numberAt(value: unknown, path: string): number | null {
  const candidate = safeGet(value, path);
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
}
function textAt(value: unknown, path: string): string | null {
  const candidate = safeGet(value, path);
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}
function safeLogo(value: string | null | undefined): string | null {
  return value && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/i.test(value) ? value : null;
}
async function errorFor(response: Response, fallback: string): Promise<Error> {
  if (response.status === 401) return new Error("Your advisor session has expired. Sign in again, then retry.");
  return new Error(await responseMessage(response, fallback));
}

export function PlanningSettings() {
  const [branding, setBranding] = useState<Branding | null>(null);
  const [requiredDisclosure, setRequiredDisclosure] = useState("");
  const [brandingCsrf, setBrandingCsrf] = useState("");
  const [assumptions, setAssumptions] = useState<UnknownRecord | null>(null);
  const [assumptionsCsrf, setAssumptionsCsrf] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingBranding, setSavingBranding] = useState(false);
  const [savingAssumptions, setSavingAssumptions] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const [brandingResponse, assumptionsResponse] = await Promise.all([
        fetch("/api/report-settings", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/assumptions", { credentials: "same-origin", cache: "no-store" }),
      ]);
      if (!brandingResponse.ok) throw await errorFor(brandingResponse, "Report branding settings are unavailable.");
      if (!assumptionsResponse.ok) throw await errorFor(assumptionsResponse, "Planning assumptions are unavailable.");
      const brandingBody = await brandingResponse.json() as BrandingResponse;
      const assumptionsBody = await assumptionsResponse.json() as AssumptionsResponse;
      setBranding(brandingBody.settings); setRequiredDisclosure(brandingBody.requiredDisclosure); setBrandingCsrf(brandingBody.csrfToken);
      setAssumptions(assumptionsBody.assumptions); setAssumptionsCsrf(assumptionsBody.csrfToken); setDraft({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Planning settings are unavailable. Try again.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function saveBranding() {
    if (!branding || !brandingCsrf) return;
    setSavingBranding(true); setError(""); setNotice("");
    try {
      if (!branding.coverText.trim() || branding.coverText.length > 300) throw new Error("Cover text is required and must be 300 characters or fewer.");
      if (branding.letter.trim().length < 30 || branding.letter.length > 5000) throw new Error("The report letter must be between 30 and 5,000 characters.");
      if (branding.additionalDisclosure.length > 1500) throw new Error("Additional disclosure must be 1,500 characters or fewer.");
      const response = await fetch("/api/report-settings", {
        method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: branding, csrfToken: brandingCsrf }),
      });
      if (!response.ok) throw await errorFor(response, "Report branding could not be saved.");
      const body = await response.json() as { settings: Branding };
      setBranding(body.settings); setNotice("Report branding saved. The mandatory system disclosure remains included in every report.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Report branding could not be saved.");
    } finally { setSavingBranding(false); }
  }

  async function selectLogo(file: File | undefined) {
    if (!file || !branding) return;
    setError("");
    if (!(file.type === "image/png" || file.type === "image/jpeg")) { setError("Logo must be a PNG or JPEG file, not an external URL."); return; }
    if (file.size > 75_000) { setError("Resize the logo below 75 KB before uploading."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!safeLogo(result)) { setError("The selected logo is not a valid PNG or JPEG data file."); return; }
      setBranding((current) => current ? { ...current, logoDataUrl: result } : current);
    };
    reader.onerror = () => setError("The logo could not be read. Choose a local PNG or JPEG below 75 KB.");
    reader.readAsDataURL(file);
  }

  async function saveAssumptions(fields: FieldSpec[], scope: string) {
    if (!assumptions || !assumptionsCsrf) return;
    setSavingAssumptions(true); setError(""); setNotice("");
    try {
      const edits = numericEdits(assumptions, draft, fields);
      if (!Object.keys(edits).length) { setNotice(`No ${scope.toLowerCase()} values changed.`); return; }
      const year = numberAt(assumptions, "year");
      const expectedVersion = textAt(assumptions, "version");
      if (year === null || !expectedVersion) throw new Error("The loaded assumption year or version is unavailable. Refresh before saving.");
      const response = await fetch("/api/assumptions", {
        method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, expectedVersion, edits, csrfToken: assumptionsCsrf }),
      });
      if (response.status === 409) throw new Error("Assumptions changed elsewhere. Refresh before saving so no edits are overwritten.");
      if (!response.ok) throw await errorFor(response, "Planning assumptions could not be saved.");
      const body = await response.json() as { assumptions: UnknownRecord };
      const savedPaths = new Set(fields.map((field) => field.path));
      setAssumptions(body.assumptions);
      setDraft((current) => Object.fromEntries(Object.entries(current).filter(([path]) => !savedPaths.has(path))));
      setNotice(`Validated ${scope.toLowerCase()} saved. Annual edits are marked as advisor-edited planning rules until independently reverified.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Planning assumptions could not be saved.");
    } finally { setSavingAssumptions(false); }
  }

  const sources = useMemo(() => assumptions ? [...records(safeGet(assumptions, "sources")), ...records(safeGet(assumptions, "annual.sources"))] : [], [assumptions]);
  const annualSections = useMemo(() => assumptions ? annualEditorSections(assumptions) : [], [assumptions]);
  const annualFields = useMemo(() => annualSections.flatMap((section) => section.fields), [annualSections]);
  const input = (spec: FieldSpec) => <label className="field" key={spec.path}><span className="field-label">{spec.label} <span className="muted">({spec.unit})</span></span><input className="input" type="number" step="any" value={draft[spec.path] ?? (assumptions ? displayEditorValue(assumptions, spec) : "")} placeholder={spec.nullable ? "Not modeled" : undefined} onChange={(event) => setDraft((current) => ({ ...current, [spec.path]: event.target.value }))} /><small>{spec.help || (spec.nullable ? "Leave blank to retain no modeled value." : `Enter a numeric value in ${spec.unit}.`)}</small></label>;
  const annualTable = (section: AnnualEditorSection) => <div className="profile-step" key={section.id}><h4>{section.title}</h4><div className="table-wrap"><table><thead><tr><th>Rule</th><th>Value</th><th>Unit</th></tr></thead><tbody>{section.fields.map((spec) => <tr key={spec.path}><th scope="row">{spec.label}{spec.help ? <small className="muted"> {spec.help}</small> : null}</th><td>{spec.readOnly ? <input className="input" type="text" value={displayEditorValue(assumptions!, spec)} readOnly aria-readonly="true" /> : <input className="input" type="number" step="any" value={draft[spec.path] ?? displayEditorValue(assumptions!, spec)} onChange={(event) => setDraft((current) => ({ ...current, [spec.path]: event.target.value }))} aria-label={`${spec.label} (${spec.unit})`} />}</td><td>{spec.unit}</td></tr>)}</tbody></table></div></div>;

  if (loading) return <section className="card loading-card"><p className="muted" aria-live="polite">Loading report and planning settings…</p></section>;
  if (!branding || !assumptions) return <section className="card"><p className="error" role="alert">{error || "Planning settings are unavailable."}</p><button className="button button-secondary" type="button" onClick={() => void load()}><RefreshCw aria-hidden="true" />Try again</button></section>;

  return <section className="planning-settings">
    <header className="workspace-header"><div><p className="eyebrow">Planning and report controls</p><h2 className="section-title">Planning settings</h2><p className="muted">Only numeric scalar values that the assumptions API validates are editable. Version, rule year, source records, boolean flags, and RMD tables are not editable here.</p></div><button className="button button-secondary" type="button" onClick={() => void load()} disabled={savingBranding || savingAssumptions}><RefreshCw aria-hidden="true" />Refresh settings</button></header>
    {(error || notice) && <p className={error ? "error-banner" : "notice"} role={error ? "alert" : "status"}>{error || notice}</p>}

    <section className="card branding-settings"><p className="eyebrow">Report branding</p><h3>Cover, letter, disclosure, and logo</h3><div className="form-grid">
      <label className="field"><span className="field-label">Cover text</span><input className="input" maxLength={300} value={branding.coverText} onChange={(event) => setBranding({ ...branding, coverText: event.target.value })} required /></label>
      <label className="field"><span className="field-label">Local logo</span><input className="input" type="file" accept="image/png,image/jpeg" onChange={(event) => void selectLogo(event.target.files?.[0])} /><small>Optional PNG or JPEG only, 75 KB maximum. External URLs are not accepted.</small>{safeLogo(branding.logoDataUrl) ? <span className="pill">Local logo attached <button className="button-ghost" type="button" onClick={() => setBranding({ ...branding, logoDataUrl: null })}>Remove</button></span> : null}</label>
      <label className="field full-width"><span className="field-label">Default editable advisor letter</span><textarea className="input" rows={8} minLength={30} maxLength={5000} value={branding.letter} onChange={(event) => setBranding({ ...branding, letter: event.target.value })} required /><small>Reports still require an explicit approval checkbox for the exact letter used at generation.</small></label>
      <label className="field full-width"><span className="field-label">Additional advisor disclosure (optional)</span><textarea className="input" rows={4} maxLength={1500} value={branding.additionalDisclosure} onChange={(event) => setBranding({ ...branding, additionalDisclosure: event.target.value })} /></label>
      <label className="field full-width"><span className="field-label">Mandatory system disclosure</span><textarea className="input" rows={5} value={requiredDisclosure} readOnly aria-readonly="true" /><small>This required disclosure is included by the report runtime and cannot be removed or replaced.</small></label>
    </div><div className="form-actions"><button className="button button-primary" type="button" onClick={() => void saveBranding()} disabled={savingBranding}><Save aria-hidden="true" />{savingBranding ? "Saving…" : "Save report settings"}</button></div>
    </section>

    <section className="card assumptions-settings"><p className="eyebrow">Saved planning bundle</p><h3>Planning assumptions</h3><p className="muted">Rules year <strong>{numberAt(assumptions, "year") ?? "Not supplied"}</strong> · version <strong>{textAt(assumptions, "version") || "Not supplied"}</strong>. Percentage fields are shown as percentages and sent as fractional rates.</p><div className="form-grid">{PLANNING_FIELDS.map(input)}</div><div className="form-actions"><button className="button button-primary" type="button" onClick={() => void saveAssumptions(PLANNING_FIELDS, "Planning assumptions")} disabled={savingAssumptions}><Save aria-hidden="true" />{savingAssumptions ? "Validating and saving…" : "Save planning assumptions"}</button></div></section>

    <section className="card annual-rules-settings"><p className="eyebrow">Yearly tax and limits</p><h3>Annual rules for {numberAt(assumptions, "annual.year") ?? numberAt(assumptions, "year") ?? "the saved year"}</h3><p className="muted">Fields are generated from this saved rule bundle, including every filing status and the current number of tax-bracket and IRMAA tiers. Rate inputs are percentages; all other units are shown in the table.</p>{annualSections.map(annualTable)}<div className="form-actions"><button className="button button-primary" type="button" onClick={() => void saveAssumptions(annualFields, "Annual rules")} disabled={savingAssumptions}><Save aria-hidden="true" />{savingAssumptions ? "Validating and saving…" : "Save annual-rule edits"}</button><span className="muted">Changes are validated against the complete saved bundle before storage.</span></div></section>

    <section className="card assumption-sources"><p className="eyebrow">Source records</p><h3>Source links and classifications</h3><p className="muted">Source records remain part of the saved annual/planning bundle. Future projected values are not represented as official law.</p>{sources.length ? <div className="table-wrap"><table><thead><tr><th>Key</th><th>Classification</th><th>Verified</th><th>Source</th></tr></thead><tbody>{sources.map((source, index) => <tr key={`${textAt(source, "key") ?? index}-${textAt(source, "url") ?? ""}`}><td>{textAt(source, "key") || "Not supplied"}</td><td>{textAt(source, "classification") || "Not supplied"}</td><td>{textAt(source, "verifiedAt") || "Not supplied"}</td><td>{textAt(source, "url") ? <a href={textAt(source, "url") ?? "#"} target="_blank" rel="noreferrer">{textAt(source, "title") || "Open source"}</a> : "Not supplied"}</td></tr>)}</tbody></table></div> : <p className="muted">No source records were supplied.</p>}</section>
  </section>;
}
