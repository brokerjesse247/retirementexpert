"use client";

import { Save, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { responseMessage } from "./api";

type SettingsResponse = { advisor: { name: string; email: string; phone: string | null; licenseNumbers: string | null }; csrfToken: string; authMode: "PASSWORD" };

export function SettingsWorkspace() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [licenseNumbers, setLicenseNumbers] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/settings", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error(await responseMessage(response, "Settings are unavailable."));
      const body = await response.json() as SettingsResponse;
      setSettings(body); setName(body.advisor.name || ""); setPhone(body.advisor.phone || ""); setLicenseNumbers(body.advisor.licenseNumbers || "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Settings are unavailable."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!settings) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/settings", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, phone, licenseNumbers, csrfToken: settings.csrfToken }) });
      if (!response.ok) throw new Error(await responseMessage(response, "Settings could not be saved."));
      setNotice("Settings saved securely.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Settings could not be saved."); }
    finally { setSaving(false); }
  }
  if (loading) return <section className="card"><p className="muted" aria-live="polite">Loading settings…</p></section>;
  if (!settings) return <section className="card"><p className="error" role="alert">{error || "Settings are unavailable."}</p><button className="button button-secondary" onClick={() => void load()}>Try again</button></section>;
  return (
    <section className="settings-workspace">
      <header className="workspace-header"><div><p className="eyebrow">Advisor workspace</p><h1>Settings</h1><p className="muted">Keep your advisor contact and licensing details current.</p></div></header>
      {(error || notice) && <p className={error ? "error" : "notice"} role={error ? "alert" : "status"}>{error || notice}</p>}
      <div className="settings-grid">
        <form className="card" onSubmit={submit}>
          <p className="eyebrow">Advisor profile</p><h2 className="section-title">Contact and license details</h2>
          <label className="field"><span>Name</span><input className="input" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label>
          <label className="field"><span>Email address</span><input className="input" value={settings.advisor.email} readOnly aria-readonly="true" /></label>
          <label className="field"><span>Phone</span><input className="input" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" /></label>
          <label className="field"><span>License number(s)</span><textarea className="input" rows={3} value={licenseNumbers} onChange={(event) => setLicenseNumbers(event.target.value)} /></label>
          <button className="button button-primary" disabled={saving}><Save aria-hidden="true" />{saving ? "Saving…" : "Save settings"}</button>
        </form>
        <section className="card">
          <ShieldCheck aria-hidden="true" /><p className="eyebrow">Account security</p><h2 className="section-title">Email and password login</h2>
          <p className="notice">Authenticator verification is disabled at your request. No app, QR code, or six-digit code is required.</p>
          <p className="muted">Password-only access is less secure than two-factor access. Use a unique password, preferably 12 or more characters. Password hashing, login attempt limits, and the 30-minute idle timeout remain active.</p>
        </section>
      </div>
    </section>
  );
}
