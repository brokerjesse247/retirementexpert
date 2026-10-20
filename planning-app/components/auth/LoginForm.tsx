"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AuthShell } from "./AuthShell";

async function getMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
  return body?.message || body?.error || fallback;
}

export function LoginForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!active) return;
        if (response.ok && (await response.json()).advisor) router.replace("/dashboard");
        else setReady(true);
      })
      .catch(() => active && setReady(true));
    return () => { active = false; };
  }, [router]);

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error(await getMessage(response, "We could not verify those credentials."));
      const session = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
      if (!session.ok || !(await session.json()).advisor) {
        throw new Error("Your browser did not retain the sign-in cookie. Open Preview in a separate window, then sign in again.");
      }
      setPassword("");
      setShowPassword(false);
      router.replace("/dashboard");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  if (!ready) return <main className="page-shell"><p className="muted">Checking secure session…</p></main>;
  return (
    <AuthShell eyebrow="Advisor access" title="Sign in to your workspace">
      <p className="muted">Use your email and password. No authenticator app or verification code is needed.</p>
      <form onSubmit={submitCredentials} noValidate>
        <label className="field"><span>Email address</span><input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <div className="field">
          <label htmlFor="advisor-password">Password</label>
          <div className="password-control">
            <input id="advisor-password" className="input" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))} onKeyDown={(e) => setCapsLock(e.getModifierState("CapsLock"))} onBlur={() => setCapsLock(false)} aria-describedby="password-entry-help" required />
            <button className="button button-secondary password-toggle" type="button" aria-controls="advisor-password" aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? "Hide" : "Show password"}</button>
          </div>
          <p id="password-entry-help" className="muted password-entry-help">Passwords are case-sensitive. Check any password your browser filled in. Do not share screenshots while it is visible.</p>
          {capsLock && <p className="error" role="status">Caps Lock is on.</p>}
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="muted"><Link href="/forgot-password">Forgot your password?</Link></p>
    </AuthShell>
  );
}
