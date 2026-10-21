import Link from 'next/link';
import { ArrowRight, ShieldCheck, ClipboardList, MessageSquare, LockKeyhole, Check, ArrowUpRight } from 'lucide-react';
import { productionIntakeBlockers } from '@/lib/operations/status';

export const dynamic = 'force-dynamic';

export default function PlanningHome() {
  const intakeCollectionClosed = productionIntakeBlockers(process.env).length > 0;
  const intakeStatus = intakeCollectionClosed ? 'CLIENT INTAKE COLLECTION CLOSED' : 'DEVELOPMENT PREVIEW';
  const intakeSummary = intakeCollectionClosed
    ? 'New-client information collection is currently closed. Advisor staff can still sign in to the private workspace. Please do not enter personal, financial, account, or login information on this public site.'
    : 'This development preview contains the eight-step intake for fictional information only. It is not available for real-client collection.';

  return <div className="landing">
    <section className="planning-hero page-shell"><div className="hero-glow" aria-hidden="true" />
      <div className="hero-copy"><span className="eyebrow"><span className="status-dot" /> {intakeStatus}</span>
        <h1>Retirement planning starts with<br /><span className="gradient-text">the right conversation.</span></h1>
        <p className="hero-lead">{intakeSummary}</p>
        <Link href="/login" className="button button-primary button-large">Advisor log in <ArrowRight size={19} /></Link>
        <Link href="/intake" className="button button-secondary button-large">View intake status</Link>
        <p className="hero-micro"><LockKeyhole size={13} /> {intakeCollectionClosed ? 'Client collection is closed' : 'Fictional information only in development preview'}</p>
      </div>
      <aside className="hero-panel card"><div className="panel-top"><span className="eyebrow">YOUR PLANNING PROFILE</span><ShieldCheck size={22} className="blue" /></div>
        <h2>Clear availability.<br />A <span className="blue">careful next step.</span></h2><p className="muted">Advisor access and client collection are managed separately.</p>
        <div className="profile-preview"><div><span className="preview-icon"><ShieldCheck size={19} /></span><div><strong>Advisor workspace</strong><small>Approved advisors can sign in</small></div><ArrowUpRight size={16} /></div><div><span className="preview-icon"><ClipboardList size={19} /></span><div><strong>New client intake</strong><small>{intakeCollectionClosed ? 'Collection is currently closed' : 'Development preview only'}</small></div><LockKeyhole size={16} /></div><div><span className="preview-icon"><MessageSquare size={19} /></span><div><strong>Planning conversation</strong><small>Start through established advisor channels</small></div><Check size={16} /></div></div>
        <div className="panel-note"><span className="status-dot" /> No client information is requested here.</div>
      </aside>
    </section>
    <section className="page-shell process-section" id="how-it-works"><div className="section-heading"><span className="eyebrow">CLEAR STATUS. CAREFUL PROCESS.</span><h2>A measured start to<br /><span className="blue">your retirement conversation.</span></h2><p className="muted">This site makes the current collection status clear before it asks anyone to share planning information.</p></div>
      <div className="process-list"><article><span className="step-number">01</span><h3>Check availability</h3><p>New-client intake collection is currently closed. The status page confirms that no information should be submitted.</p></article><article><span className="step-number">02</span><h3>Advisor access</h3><p>Approved advisors can sign in to the private workspace using their established credentials.</p></article><article><span className="step-number">03</span><h3>Plan the conversation</h3><p>When appropriate, begin through an established advisor channel—not by sending sensitive information through this public page.</p></article></div>
    </section>
    <section className="page-shell"><div className="trust-banner"><ShieldCheck size={33} /><div><h3>Personal information deserves a careful process.</h3><p>Client collection remains closed while production protections are verified. Never provide Social Security numbers, account numbers, passwords, or login credentials on this public site.</p></div><Link href="/privacy">How your information is handled <ArrowRight size={16} /></Link></div><div className="notice phase-notice"><strong>Client intake collection is currently closed.</strong> This public page provides general information and advisor access only. It does not indicate that real-client intake, email delivery, reports, or every planning feature is available in production.</div></section>
  </div>;
}
