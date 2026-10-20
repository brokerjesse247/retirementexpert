import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return (
    <main className="page-shell auth-shell">
      <section className="card auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="auth-title">{title}</h1>
        {children}
        <p className="muted auth-footer">Retirement planning workspace for authorized advisors.</p>
        <p className="muted auth-links"><Link href="/privacy">Privacy</Link></p>
      </section>
    </main>
  );
}
