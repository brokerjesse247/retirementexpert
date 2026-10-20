import Link from 'next/link';
import { CheckCircle2, ArrowRight } from 'lucide-react';
type ThankYouProps = {
  searchParams: Promise<{ emailDelivery?: string | string[] }>;
};

function deliveryStatus(value: string | undefined) {
  switch (value) {
    case 'sent':
      return 'A confirmation email was sent.';
    case 'queued':
      return 'A confirmation email has been queued for delivery.';
    case 'failed':
      return 'Your intake was received, but we could not queue a confirmation email. Your advisor can follow up.';
    default:
      return 'Your intake was received. This direct page view does not include an email-delivery status.';
  }
}

export default async function ThankYou({ searchParams }: ThankYouProps) {
  const params = await searchParams;
  const delivery = typeof params.emailDelivery === 'string' ? params.emailDelivery : undefined;
  return <section className="page-shell confirmation-page"><span className="success-icon"><CheckCircle2 size={34} /></span><span className="eyebrow">THE NEXT STEP STARTS HERE</span><h1>Thank you for<br /><span className="gradient-text">sharing your planning information.</span></h1><p className="hero-lead">After a successful submission, your profile is available to your LSRT advisor for review. They can help clarify the details and discuss what comes next.</p><div className="card"><h2>What happens next</h2><ol className="next-steps"><li>Your advisor reviews your submitted information.</li><li>They follow up to clarify details and discuss your retirement goals.</li><li>You decide on the next step together. No report or financial result is promised by this form.</li></ol><p className="muted" role="status">{deliveryStatus(delivery)}</p></div><Link href="/" className="button button-secondary">Back to planning home <ArrowRight size={16} /></Link></section>;
}
