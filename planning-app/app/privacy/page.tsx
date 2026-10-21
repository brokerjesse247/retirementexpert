import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { productionIntakeBlockers } from '@/lib/operations/status';
import { hasVerifiedLaunchEvidence } from '@/lib/operations/launch-evidence';

export const dynamic = 'force-dynamic';

export default function Privacy() {
  const policyActive = process.env.RETENTION_POLICY_APPROVED === 'true' && process.env.LEGAL_HOLD_PROCESS_APPROVED === 'true' && process.env.COMPLIANCE_APPROVED_REAL_CLIENT_INTAKE === 'true';
  const collectionOpen = process.env.NODE_ENV !== 'production' || productionIntakeBlockers().length === 0;
  const recoveryVerified = process.env.BACKUP_OFFHOST_VERIFIED === 'true' && hasVerifiedLaunchEvidence();
  const notice = policyActive && collectionOpen
    ? <><strong>Operational policy attested.</strong> The configured production protections are supported by a protected owner-approval and recovery record. This is not a certification that every applicable legal requirement has been independently reviewed.</>
    : policyActive
      ? <><strong>Production intake closed.</strong> Owner policy approval is recorded, but separate technical recovery and launch checks remain incomplete. Do not submit real information until collection opens.</>
    : process.env.NODE_ENV === 'production'
      ? <><strong>Production intake closed.</strong> LSRT has not yet approved the production privacy, retention, legal-hold and backup policy. Do not submit real planning information or upload statements.</>
      : <><strong>Development-stage notice.</strong> Until LSRT approves production privacy, retention, storage and backup arrangements, use fictional test information only. Do not upload real statements in this development workspace.</>;
  return <article className="page-shell prose-page"><span className="eyebrow"><ShieldCheck size={16} /> PRIVACY NOTICE · VERSION 2026-10-21</span><h1>Your information,<br /><span className="blue">handled with care.</span></h1>
    <div className="notice">{notice}</div>
    <h2>What the intake collects</h2><p>The questionnaire asks for contact information, birth date, household situation, retirement goals, approximate income and savings, expenses, Social Security benefit estimates, health/protection answers and estate-document status. These details support an advisor-reviewed retirement-planning profile.</p>
    <h2>What you should never provide</h2><p>Do not provide Social Security numbers, account numbers, passwords or login credentials. An optional SSA statement must be a PDF with sensitive identifiers redacted. Uploading a statement is not required.</p>
    <h2>Saving and returning</h2><p>Answers are saved on the server through a restricted intake session. Portal emails are routed only to brokerjesse247@gmail.com, not directly to a client's entered email address. Delivery is shown as queued until the provider accepts it. Jesse may securely relay a resume/update link only to its intended client. Resume links are access credentials; never send them to another client, and never forward an advisor password-reset link to clients. Sensitive answers are not stored in browser local storage.</p>
    <h2>Who can access your profile</h2><p>The assigned LSRT advisor can review and edit the profile after submission. Advisor access requires a verified email/password login, protected server session and idle timeout. Profile/raw intake content, report snapshots, generated PDFs and optional uploads are encrypted at the application layer. Some normalized contact and structured planning fields are private database fields used by the advisor workspace rather than application-layer encrypted blobs. Private report links expire and require the owning advisor’s live session. Uploaded documents are not automatically sent to AI services.</p>
    <h2>Reports and retention</h2><p>Generating a report saves a versioned snapshot of its inputs, assumptions, sources, results and advisor-approved letter. Editing a profile does not rewrite previously generated reports. Reports record an immutable six-year retention date. The owning advisor can place or release an audited legal hold; release does not delete data, and submitted records are not automatically permanently deleted. {recoveryVerified ? 'The configured off-host encrypted recovery copy has been verified; recovery secrets require separate protected custody.' : 'Off-host recovery and separate key custody remain unverified; local encryption or a restore flag alone does not establish independent recovery.'} Contact the LSRT advisor to request access or correction; deletion requests require owner review and may be limited by obligations that apply.</p>
    <h2>Planning is not a guarantee</h2><p>Reports are educational and illustrative, not guarantees or filed tax calculations. Incomplete inputs and unsupported cases are identified for advisor review. LSRT Insurance does not provide tax or legal advice. Consult a qualified tax professional or attorney. Reports are not automatically emailed.</p>
    <Link href={collectionOpen ? '/intake' : '/login'} className="button button-primary">{collectionOpen ? 'Continue to the questionnaire' : 'Advisor log in'}</Link>
  </article>;
}
