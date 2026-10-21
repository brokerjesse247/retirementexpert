import { describe, expect, it, vi } from 'vitest';
vi.mock('../lib/db', () => ({ db: {} }));
import { applicationOrigin, defaultReviewDate, reviewDate } from '../lib/annual-review/service';

describe('annual review date rules', () => {
  it('defaults to twelve months later and handles leap day without moving to March', () => {
    expect(defaultReviewDate(new Date('2028-02-29T12:00:00Z'))).toBe('2029-02-28');
    expect(defaultReviewDate(new Date('2026-10-21T12:00:00Z'))).toBe('2027-10-21');
  });
  it('rejects impossible, past and excessively distant dates', () => {
    const now = new Date('2026-10-21T12:00:00Z');
    expect(() => reviewDate('2027-02-30', now)).toThrow();
    expect(() => reviewDate('2026-10-20', now)).toThrow();
    expect(() => reviewDate('2035-10-21', now)).toThrow();
    expect(reviewDate('2027-10-21', now).toISOString()).toBe('2027-10-21T00:00:00.000Z');
  });
  it('uses only the configured secure public origin for grants', () => {
    const prior = process.env.APP_ORIGIN;
    try {
      for (const value of ['http://example.invalid', 'https://example.invalid/path', 'https://user:pass@example.invalid/', 'https://example.invalid/?redirect=bad']) {
        process.env.APP_ORIGIN = value;
        expect(() => applicationOrigin()).toThrow();
      }
      process.env.APP_ORIGIN = 'https://plan.example.invalid';
      expect(applicationOrigin()).toBe('https://plan.example.invalid');
    } finally { if (prior === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = prior; }
  });
});
