import { describe, expect, it, vi } from 'vitest';
vi.mock('../lib/db', () => ({ db: {} }));
import { DEFAULT_EMAIL_TEMPLATES, renderEmailTemplate, templatesSchema } from '../lib/email-templates/service';
describe('annual email templates', () => {
  it('rejects missing links, unknown placeholders and multi-line subjects', () => {
    const data = structuredClone(DEFAULT_EMAIL_TEMPLATES); data.ANNUAL_UPDATE.text = 'Please update your information through the advisor.';
    expect(templatesSchema.safeParse(data).success).toBe(false);
    data.ANNUAL_UPDATE.text = 'Please use {{updateLink}} and reveal {{accountNumber}}.';
    expect(templatesSchema.safeParse(data).success).toBe(false);
    data.ANNUAL_UPDATE = structuredClone(DEFAULT_EMAIL_TEMPLATES.ANNUAL_UPDATE); data.ANNUAL_UPDATE.subject = 'Title\nInjected';
    expect(templatesSchema.safeParse(data).success).toBe(false);
  });
  it('escapes advisor text and retains mandatory expiry safeguards', () => {
    const result = renderEmailTemplate({ subject: 'Update {{reviewDate}}', text: '<script>bad</script> {{updateLink}}' }, { reviewDate: '2027-10-21', updateLink: 'https://example.invalid/intake?resume=token' }, true);
    expect(result.html).not.toContain('<script>'); expect(result.html).toContain('&lt;script&gt;'); expect(result.text).toContain('expires in seven days'); expect(result.text).toContain('Do not forward'); expect(result.subject).toBe('Update 2027-10-21');
  });
});
