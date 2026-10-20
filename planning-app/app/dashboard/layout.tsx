"use client";

import type { ReactNode } from "react";
import { AdvisorShell } from "@/components/advisor/AdvisorShell";
import { SessionGate } from "@/components/advisor/SessionGate";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <SessionGate>{(session) => <AdvisorShell session={session}>{children}</AdvisorShell>}</SessionGate>;
}
