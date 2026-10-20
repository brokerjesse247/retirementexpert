"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AuthShell } from "./AuthShell";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_LENGTH_MESSAGE, validPasswordLength } from "@/lib/auth/password-policy";

export function ResetPasswordForm() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    const params = new URLSearchParams(fragment);
    const value = params.get("token") || (fragment && !fragment.includes("=") ? fragment : null);
    setToken(value);
    if (window.location.hash) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!token) { setError("This reset link is missing or has already been used."); return; }
    if (password !== confirmation) { setError("Passwords do not match."); return; }
    if (!validPasswordLength(password)) { setError(PASSWORD_LENGTH_MESSAGE); return; }
    setPending(true);
    try {
      const response = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      if (!response.ok) { const body = await response.json().catch(() => null) as { error?: string; message?: string } | null; throw new Error(body?.message || body?.error || "This reset link is invalid or expired."); }
      setToken(null); setPassword(""); setConfirmation(""); setComplete(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Something went wrong."); }
    finally { setPending(false); }
  }
  return <AuthShell eyebrow="Account recovery" title="Choose a new password">
    {complete ? <><p className="notice">Your password has been updated. For your security, previous sessions have been signed out.</p><Link className="button button-primary" href="/login">Sign in</Link></> : !token ? <><p className="error">This reset link is missing, invalid, or expired.</p><Link className="button button-secondary" href="/forgot-password">Request a new link</Link></> : <form onSubmit={submit} noValidate>
      <p className="muted">{PASSWORD_LENGTH_MESSAGE}</p>
      <label className="field"><span>New password</span><input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} required /></label>
      <label className="field"><span>Confirm new password</span><input className="input" type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} required /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="button button-primary" disabled={pending}>{pending ? "Updating…" : "Update password"}</button>
    </form>}
  </AuthShell>;
}
