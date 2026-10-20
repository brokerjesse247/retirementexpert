import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IntakeSubmitControls } from '../components/intake/IntakeSubmitControls';
import { CONSENT_TEXT } from '../lib/intake/schema';

function render(consent: boolean, submitting = false) {
  return renderToStaticMarkup(<IntakeSubmitControls consent={consent} submitting={submitting} onConsentChange={() => {}} />);
}
function submitTag(html: string) {
  return html.match(/<button[^>]*type="submit"[^>]*>/)?.[0] ?? '';
}
describe('visible intake consent submission gate', () => {
  it('is unchecked by default with a disabled submit button and clear draft explanation', () => {
    const html = render(false);
    expect(submitTag(html)).toContain('disabled');
    expect(html).toContain('Submission is locked');
    expect(html).toContain('not a dashboard client');
    expect(html).toContain(CONSENT_TEXT);
    expect(html.match(/<input[^>]*>/)?.[0]).not.toContain('checked');
  });
  it('unlocks submission only after consent is checked', () => {
    const html = render(true);
    expect(submitTag(html)).not.toContain('disabled');
    expect(html.match(/<input[^>]*>/)?.[0]).toContain('checked');
  });
  it('locks submission again while a request is pending or consent is unchecked', () => {
    expect(submitTag(render(true, true))).toContain('disabled');
    expect(submitTag(render(false))).toContain('disabled');
  });
});
