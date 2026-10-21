"use client";
import { useEffect, useState } from 'react';
import { OpportunityBadges, type OpportunityBadgeEvaluation } from './OpportunityBadges';
export function ClientOpportunityBadges({ clientId }: { clientId: string }) {
  const [evaluations, setEvaluations] = useState<OpportunityBadgeEvaluation[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setEvaluations(null); setFailed(false);
    void fetch(`/api/clients/${encodeURIComponent(clientId)}/recommendations`, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal }).then(async r => { if (!r.ok) throw new Error('Unavailable'); const body = await r.json() as { evaluations: OpportunityBadgeEvaluation[] }; setEvaluations(body.evaluations); }).catch(e => { if (e instanceof Error && e.name !== 'AbortError') setFailed(true); });
    return () => controller.abort();
  }, [clientId]);
  if (failed) return <p className="muted">Review-candidate badges could not load. Open Recommendations to retry.</p>;
  if (!evaluations) return <p className="muted" role="status">Checking saved analysis for review candidates…</p>;
  return <OpportunityBadges evaluations={evaluations} />;
}
