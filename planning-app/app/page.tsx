import Link from 'next/link';
import { ArrowRight, ShieldCheck, ClipboardList, MessageSquare, LockKeyhole, Check, ArrowUpRight } from 'lucide-react';

export default function PlanningHome() {
  return <div className="landing">
    <section className="planning-hero page-shell"><div className="hero-glow" aria-hidden="true" />
      <div className="hero-copy"><span className="eyebrow"><span className="status-dot" /> PERSONAL RETIREMENT PLANNING</span>
        <h1>Your next chapter.<br /><span className="gradient-text">A clearer plan.</span></h1>
        <p className="hero-lead">Start with your story. We’ll help organize the details that matter to your retirement—so your conversation with an advisor starts in the right place.</p>
        <Link href="/intake" className="button button-primary button-large">Start my retirement plan <ArrowRight size={19} /></Link>
        <p className="hero-micro"><LockKeyhole size={13} /> No client account needed · About 10–15 minutes</p>
      </div>
      <aside className="hero-panel card"><div className="panel-top"><span className="eyebrow">YOUR PLANNING PROFILE</span><ShieldCheck size={22} className="blue" /></div>
        <h2>One place for<br />the bigger picture.</h2><p className="muted">Bring the pieces together before making the next decision.</p>
        <div className="profile-preview"><div><span className="preview-icon"><ClipboardList size={19} /></span><div><strong>Your retirement goals</strong><small>Timing, lifestyle & priorities</small></div><Check size={16} /></div><div><span className="preview-icon"><MessageSquare size={19} /></span><div><strong>Your financial picture</strong><small>Income, savings & protection</small></div><Check size={16} /></div><div><span className="preview-icon"><ShieldCheck size={19} /></span><div><strong>An advisor conversation</strong><small>Reviewed by a real professional</small></div><ArrowUpRight size={16} /></div></div>
        <div className="panel-note"><span className="status-dot" /> Your information. Your next step.</div>
      </aside>
    </section>
    <section className="page-shell process-section" id="how-it-works"><div className="section-heading"><span className="eyebrow">LESS GUESSWORK. MORE CLARITY.</span><h2>A thoughtful start to<br /><span className="blue">your retirement conversation.</span></h2><p className="muted">You don’t need every answer today. Gather what you know, save your progress, and return when you’re ready.</p></div>
      <div className="process-list"><article><span className="step-number">01</span><h3>Share your picture</h3><p>Walk through eight short sections covering your goals, income, savings, healthcare and family.</p></article><article><span className="step-number">02</span><h3>Review the details</h3><p>Check your answers before submitting. Your advisor can help clarify information that needs a closer look.</p></article><article><span className="step-number">03</span><h3>Plan the conversation</h3><p>Use your completed profile as the starting point for an informed conversation—not a promise of an outcome.</p></article></div>
    </section>
    <section className="page-shell"><div className="trust-banner"><ShieldCheck size={33} /><div><h3>Personal information deserves a careful process.</h3><p>No Social Security numbers, account numbers or passwords. Review our privacy notice before sharing financial information.</p></div><Link href="/privacy">How your information is handled <ArrowRight size={16} /></Link></div><div className="notice phase-notice"><strong>Foundation release.</strong> Client intake and advisor review are the current workflow. Financial calculations, scenarios and PDF retirement reports are being built in later phases and are not available yet.</div></section>
  </div>;
}
