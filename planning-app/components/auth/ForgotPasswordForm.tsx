"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthShell } from "./AuthShell";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    try {
      const response = await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (!response.ok) throw new Error("We could not process that request. Please try again.");
      setComplete(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Something went wrong."); }
    finally { setPending(false); }
  }
  return <AuthShell eyebrow="Account recovery" title="Reset your password">
    {complete ? <><p className="notice">If an account matches that email address, reset instructions will arrive shortly.</p><p><Link className="button button-secondary" href="/login">Back to sign in</Link></p></> : <form onSubmit={submit} noValidate>
      <p className="muted">Enter your email address and we’ll handle the rest securely.</p>
      <label className="field"><span>Email address</span><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="button button-primary" disabled={pending}>{pending ? "Submitting…" : "Send reset instructions"}</button>
      <p className="muted"><Link href="/login">Return to sign in</Link></p>
    </form>}
  </AuthShell>;
}
