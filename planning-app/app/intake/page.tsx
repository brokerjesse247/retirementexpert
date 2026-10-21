import { IntakeForm } from '@/components/intake/IntakeForm';
import Link from 'next/link';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { productionIntakeBlockers } from '@/lib/operations/status';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Client Intake Status | LSRT Insurance',
  description: 'Current availability for LSRT Insurance retirement planning intake.',
};

export default function IntakePage() {
  if (productionIntakeBlockers(process.env).length) {
    return <section className="page-shell confirmation-page">
      <span className="success-icon"><LockKeyhole size={34} /></span>
      <span className="eyebrow">LSRT INSURANCE · INTAKE STATUS</span>
      <h1>Client intake collection<br /><span className="gradient-text">is currently closed.</span></h1>
      <p className="hero-lead">We are not accepting new retirement-planning information through this site right now. Please do not enter personal, financial, account, or login information here.</p>
      <div className="card"><h2>Advisor access remains available</h2><p className="muted">Approved advisors can sign in to the private workspace. New client collection will remain unavailable until the required production protections are approved and verified.</p></div>
      <Link href="/login" className="button button-primary">Advisor log in <ArrowRight size={16} /></Link>
      <Link href="/" className="button button-secondary">Back to planning home</Link>
    </section>;
  }

  return <IntakeForm />;
}
