"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import type { AdvisorSession } from "./types";

export function SessionGate({ children }: { children: (session: AdvisorSession) => ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<AdvisorSession | null>(null);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!alive) return;
        if (response.status === 401) { router.replace("/login"); return; }
        if (!response.ok) { setFailure("Your secure session could not be checked. Please try again."); return; }
        const body = await response.json() as AdvisorSession;
        if (!body.advisor) { router.replace("/login"); return; }
        setSession(body);
      })
      .catch(() => alive && setFailure("Your secure session could not be checked. Please try again."));
    return () => { alive = false; };
  }, [router]);
  useEffect(() => {
    if (!session?.advisor || !session.csrfToken) return;
    const minimumHeartbeatInterval = 60_000;
    let active = true;
    let inFlight = false;
    let lastHeartbeatAt = 0;
    const reportActivity = (event: Event) => {
      if (!event.isTrusted) return;
      const now = Date.now();
      if (inFlight || now - lastHeartbeatAt < minimumHeartbeatInterval) return;
      inFlight = true;
      lastHeartbeatAt = now;
      void fetch("/api/auth/activity", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrfToken: session.csrfToken }),
      }).then((response) => {
        if (active && response.status === 401) router.replace("/login");
      }).catch(() => {
        // A transient network failure should not sign out an active advisor.
      }).finally(() => { inFlight = false; });
    };
    window.addEventListener("pointerdown", reportActivity, { passive: true });
    window.addEventListener("keydown", reportActivity);
    return () => {
      active = false;
      window.removeEventListener("pointerdown", reportActivity);
      window.removeEventListener("keydown", reportActivity);
    };
  }, [router, session?.advisor, session?.csrfToken]);
  if (failure) return <main className="page-shell"><section className="card"><p className="error" role="alert">{failure}</p><button className="button button-secondary" onClick={() => window.location.reload()}>Try again</button></section></main>;
  if (!session) return <main className="page-shell"><p className="muted" aria-live="polite">Opening secure workspace…</p></main>;
  return <>{children(session)}</>;
}
