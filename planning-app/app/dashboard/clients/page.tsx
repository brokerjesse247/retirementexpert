"use client";
import { useSearchParams } from "next/navigation";
import { ClientsWorkspace } from "@/components/advisor/ClientsWorkspace";
export default function ClientsPage() { const params = useSearchParams(); return <ClientsWorkspace initialSearch={params.get("search") || ""} initialStatus={params.get("status") || ""} />; }
