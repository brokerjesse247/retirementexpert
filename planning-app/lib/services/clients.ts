import { ClientStatus, Prisma } from '@prisma/client';

export const CLIENT_STATUSES = Object.values(ClientStatus);

export function clientStatus(value: string | null): ClientStatus | undefined {
  return value && (CLIENT_STATUSES as string[]).includes(value) ? value as ClientStatus : undefined;
}

export function clientWhere(advisorId: string, search: string, status: ClientStatus | undefined): Prisma.ClientWhereInput {
  return {
    advisorId,
    ...(status ? { status } : {}),
    ...(search ? { OR: [{ firstName: { contains: search } }, { lastName: { contains: search } }, { email: { contains: search } }] } : {}),
  };
}

export function ageFromDob(dob: Date | null | undefined): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  if (now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

export function csvValue(value: string | number | Date | null | undefined): string {
  let text = value instanceof Date ? value.toISOString() : value == null ? '' : String(value);
  // Spreadsheet formula injection: prefix all formula-leading data with an apostrophe.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
