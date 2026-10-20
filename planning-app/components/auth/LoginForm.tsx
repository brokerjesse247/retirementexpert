"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AuthShell } from "./AuthShell";

type LoginResponse = { requiresTwoFactor?: boolean; enrollmentRequired?: boolean; csrfToken?: string };
type EnrollResponse = { secret?: string; uri?: string; qrDataUrl?: string; csrfToken?: string; recoveryCodes?: string[] };

async function getMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string; message?: string } | null;
  return body?.message || body?.error || fallback;
}

export function LoginForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [csrfToken, setCsrfToken] = useState("");
  const [stage, setStage] = useState<"credentials" | "verify" | "enroll" | "recovery">("credentials");
  const [enrollment, setEnrollment] = useState<EnrollResponse | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
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
    setError(""); setPending(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error(await getMessage(response, "We could not verify those credentials."));
      const result = await response.json() as LoginResponse;
      if (!result.requiresTwoFactor || !result.csrfToken) throw new Error("A secure sign-in challenge could not be created. Please try again.");
      setCsrfToken(result.csrfToken);
      if (result.enrollmentRequired) {
        const enrollmentResponse = await fetch("/api/auth/enroll", { credentials: "same-origin", cache: "no-store" });
        if (!enrollmentResponse.ok) throw new Error(await getMessage(enrollmentResponse, "Could not start two-factor enrollment."));
        const enrollmentData = await enrollmentResponse.json() as EnrollResponse;
        setEnrollment(enrollmentData);
        setCsrfToken(enrollmentData.csrfToken || result.csrfToken);
        setStage("enroll");
      } else setStage("verify");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in is temporarily unavailable.");
    } finally { setPending(false); }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setPending(true);
    try {
      const endpoint = stage === "enroll" ? "/api/auth/enroll" : "/api/auth/verify";
      const response = await fetch(endpoint, {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), csrfToken }),
      });
      if (!response.ok) throw new Error(await getMessage(response, "That verification code was not accepted."));
      const result = await response.json().catch(() => ({})) as EnrollResponse;
      if (stage === "enroll" && Array.isArray(result.recoveryCodes)) {
        setRecoveryCodes(result.recoveryCodes);
        setStage("recovery");
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verification is temporarily unavailable.");
    } finally { setPending(false); }
  }

  if (!ready) return <main className="page-shell"><p className="muted">Checking secure session…</p></main>;
  if (stage === "credentials") return (
    <AuthShell eyebrow="Advisor access" title="Sign in to your workspace">
      <form onSubmit={submitCredentials} noValidate>
        <label className="field"><span>Email address</span><input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field"><span>Password</span><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Checking…" : "Continue"}</button>
      </form>
      <p className="muted"><Link href="/forgot-password">Forgot your password?</Link></p>
    </AuthShell>
  );

  if (stage === "recovery") return (
    <AuthShell eyebrow="Account recovery" title="Save your recovery codes">
      <p className="notice">Store these codes somewhere secure. Each can be used once if your authenticator is unavailable; they will not be shown again.</p>
      <div className="recovery-codes" aria-label="One-time recovery codes">{recoveryCodes.map((recoveryCode) => <code key={recoveryCode}>{recoveryCode}</code>)}</div>
      <button className="button button-primary" type="button" onClick={() => { router.replace("/dashboard"); router.refresh(); }}>I’ve stored my codes</button>
    </AuthShell>
  );

  return (
    <AuthShell eyebrow={stage === "enroll" ? "Secure your account" : "Second factor"} title={stage === "enroll" ? "Set up authenticator verification" : "Verify it’s you"}>
      {stage === "enroll" && <>
        <p className="muted">Scan this one-time QR code with your authenticator app, then enter its six-digit code. Save the recovery codes shown after verification in a secure location.</p>
        {enrollment?.qrDataUrl ? <img className="auth-qr qr-image" src={enrollment.qrDataUrl} alt="Authenticator enrollment QR code" /> : <p className="notice">Preparing your enrollment code…</p>}
        {enrollment?.secret && <details><summary>Can’t scan the QR code?</summary><p className="muted">Manual setup key: <code>{enrollment.secret}</code></p></details>}
      </>}
      {stage === "verify" && <p className="muted">Enter a current authenticator code or a recovery code.</p>}
      <form onSubmit={submitCode} noValidate>
        <label className="field"><span>Authenticator or recovery code</span><input className="input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button button-primary" type="submit" disabled={pending || (stage === "enroll" && !enrollment)}>{pending ? "Verifying…" : "Verify and sign in"}</button>
      </form>
      <button className="button button-secondary" type="button" onClick={() => { setStage("credentials"); setCode(""); setError(""); }}>Use a different account</button>
    </AuthShell>
  );
}
