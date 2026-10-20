'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

async function responseMessage(response: Response) {
  try {
    const body = await response.json() as { error?: unknown };
    return typeof body.error === 'string' ? body.error : 'This resume link could not be used.';
  } catch {
    return 'This resume link could not be used.';
  }
}

export default function ResumeIntakePage() {
  const router = useRouter();
  const [message, setMessage] = useState('Opening your secure draft…');

  useEffect(() => {
    let active = true;
    const exchange = async () => {
      const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
      // Fragments are never sent to a server; remove it before doing any request or navigation.
      window.history.replaceState(null, '', '/intake/resume');
      if (!token) {
        if (active) setMessage('This resume link is missing or incomplete. Request a new link from your intake draft.');
        return;
      }
      const response = await fetch('/api/intake/resume/exchange', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!active) return;
      if (!response.ok) {
        setMessage(await responseMessage(response));
        return;
      }
      router.replace('/intake');
    };
    void exchange();
    return () => { active = false; };
  }, [router]);

  return <main className="page-shell"><section className="card"><p className="eyebrow">LSRT Insurance</p><h1>Resume your retirement intake</h1><p className="muted" role="status">{message}</p></section></main>;
}
