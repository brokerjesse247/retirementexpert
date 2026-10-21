import Decimal from 'decimal.js';

/** Dollar outputs are rounded to cents explicitly. Relational persistence remains integer cents. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > 1e13) throw new Error('Calculation amount outside supported range.');
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}
export function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
export function ageMonthsOn(dob: string, date: string): number {
  const birth = new Date(`${dob.slice(0, 10)}T00:00:00Z`);
  const now = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(birth.getTime()) || !Number.isFinite(now.getTime())) throw new Error('Invalid calculation date.');
  return (now.getUTCFullYear() - birth.getUTCFullYear()) * 12 + now.getUTCMonth() - birth.getUTCMonth() - (now.getUTCDate() < birth.getUTCDate() ? 1 : 0);
}
export function ageAtYear(dob: string, year: number): number { return Math.floor(ageMonthsOn(dob, `${year}-12-31`) / 12); }
export function dollars(raw: string | null | undefined): number {
  if (!raw) return 0;
  const amount = new Decimal(raw.replace(/[$,\s]/g, ''));
  if (amount.isNegative() || !amount.isFinite() || amount.gt(1e12)) throw new Error('Amount exceeds supported calculation range.');
  return amount.toDecimalPlaces(2).toNumber();
}
export function uniqueWarnings(items: string[]): string[] { return [...new Set(items.filter(Boolean))]; }
