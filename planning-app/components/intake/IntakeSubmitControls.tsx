import { CONSENT_TEXT } from '@/lib/intake/schema';

type Props = {
  consent: boolean;
  submitting: boolean;
  blocked?: boolean;
  error?: string;
  submissionError?: string;
  onConsentChange: (checked: boolean) => void;
};

export function IntakeSubmitControls({ consent, submitting, blocked = false, error, submissionError, onConsentChange }: Props) {
  return <div>
    <section className="notice" aria-labelledby="intake-consent-heading">
      <h3 id="intake-consent-heading">Consent required before submitting</h3>
      <label htmlFor="intake-consent">
        <input id="intake-consent" type="checkbox" required checked={consent} disabled={submitting} onChange={(event) => onConsentChange(event.target.checked)} aria-describedby="intake-consent-help" aria-invalid={Boolean(error)} />
        {' '}{CONSENT_TEXT}
      </label>
      <p id="intake-consent-help" className="muted">Your answers are saved as a draft, not a dashboard client. Check the box if you agree, then click Submit retirement intake to send your profile to the advisor.</p>
      {!consent && <p className="error" role="status">Submission is locked until you check the consent box.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
    {submissionError && <p className="error" role="alert">{submissionError}</p>}
    {blocked && consent && <p className="error" role="status">Correct the highlighted questions before submitting.</p>}
    <button type="submit" className="button button-primary" disabled={!consent || submitting || blocked} aria-describedby="intake-consent-help">{submitting ? 'Submitting securely…' : 'Submit retirement intake'}</button>
  </div>;
}
