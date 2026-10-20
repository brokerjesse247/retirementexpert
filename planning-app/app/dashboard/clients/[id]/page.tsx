import { ClientDetailWorkspace } from "@/components/advisor/ClientDetailWorkspace";
export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <ClientDetailWorkspace clientId={id} />; }
