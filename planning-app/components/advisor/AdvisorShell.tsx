"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ClipboardList, LayoutDashboard, LogOut, Settings, Users } from "lucide-react";
import { type ReactNode, useState } from "react";
import { responseMessage } from "./api";
import type { AdvisorSession } from "./types";

const navigation = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/clients", label: "Clients", icon: Users },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function AdvisorShell({ session, children }: { session: AdvisorSession; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    if (!session.csrfToken) { router.replace("/login"); return; }
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csrfToken: session.csrfToken }) });
      if (!response.ok) throw new Error(await responseMessage(response, "Could not sign out securely."));
      router.replace("/login"); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not sign out securely."); }
    finally { setPending(false); }
  }
  return <div className="workspace-shell">
    <aside className="workspace-sidebar" aria-label="Advisor navigation">
      <Link href="/dashboard" className="workspace-brand wordmark"><ClipboardList aria-hidden="true" /><span>Retirement<br />Planning</span></Link>
      <nav>
        {navigation.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return <Link key={href} href={href} className={active ? "nav-link active" : "nav-link"} aria-current={active ? "page" : undefined}><Icon aria-hidden="true" />{label}</Link>;
        })}
      </nav>
      <div className="workspace-account advisor-profile"><strong>{session.advisor?.name}</strong><span className="muted">{session.advisor?.email}</span>{error && <p className="error" role="alert">{error}</p>}<button className="button button-secondary" type="button" onClick={logout} disabled={pending}><LogOut aria-hidden="true" />{pending ? "Signing out…" : "Sign out"}</button></div>
    </aside>
    <main className="workspace-main">{children}</main>
  </div>;
}
