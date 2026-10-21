import { z } from 'zod';
import { db } from '../db';
import { decryptJson, encryptJson } from '../auth/crypto';
import { ApiError } from '../auth/http';

export const retentionActionSchema = z.enum(['hold', 'release']);
export type RetentionAction = z.infer<typeof retentionActionSchema>;

export const retentionChangeSchema = z.object({
  action: retentionActionSchema,
  reason: z.string().trim().min(1, 'A reason is required.').max(500, 'Reason must be 500 characters or fewer.'),
  revision: z.number().int().min(1),
  csrfToken: z.string(),
}).strict();

type RetentionEvent = {
  action: RetentionAction;
  reason: string;
  recordedAt: string;
};

type RetentionReasonRecord = {
  events: RetentionEvent[];
};

type AdvisorSettings = Record<string, unknown>;

function retentionSettingsKey(clientId: string): string {
  return `retention-${clientId}`;
}

function plainObject(value: unknown): AdvisorSettings {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as AdvisorSettings) } : {};
}

function previousEvents(value: unknown): RetentionEvent[] {
  const events = plainObject(value).events;
  if (!Array.isArray(events)) return [];
  return events.flatMap((event): RetentionEvent[] => {
    const row = plainObject(event);
    if ((row.action !== 'hold' && row.action !== 'release') || typeof row.reason !== 'string' || typeof row.recordedAt !== 'string') return [];
    return [{ action: row.action, reason: row.reason, recordedAt: row.recordedAt }];
  });
}

/**
 * Report-branding settings and retention reasons share the existing encrypted advisor-settings
 * record. Reasons remain private: only the encrypted setting contains their text.
 */
export function settingsWithRetentionReason(encryptedSettings: string | null, clientId: string, action: RetentionAction, reason: string, recordedAt = new Date()): string {
  const settings = encryptedSettings ? plainObject(decryptJson<unknown>(encryptedSettings)) : {};
  const key = retentionSettingsKey(clientId);
  const record: RetentionReasonRecord = {
    events: [...previousEvents(settings[key]), { action, reason, recordedAt: recordedAt.toISOString() }],
  };
  settings[key] = record;
  return encryptJson(settings);
}

function retentionConflict(action: RetentionAction): ApiError {
  return new ApiError(409, action === 'hold' ? 'This legal hold is already active or the client changed elsewhere. Reload and try again.' : 'This legal hold is already released or the client changed elsewhere. Reload and try again.');
}

async function ownedClientRetention(clientId: string, advisorId: string) {
  const client = await db.client.findFirst({
    where: { id: clientId, advisorId },
    select: { id: true, retentionHold: true, revision: true },
  });
  if (!client) throw new ApiError(404, 'Client not found.');
  return client;
}

export type RetentionOverview = {
  retentionHold: boolean;
  revision: number;
  reportRetention: {
    reportCount: number;
    earliestRetainUntil: string | null;
    latestRetainUntil: string | null;
  };
};

/** Returns only hold state and immutable report-retention dates—never intake answers or reasons. */
export async function retentionOverview(clientId: string, advisorId: string): Promise<RetentionOverview> {
  const client = await ownedClientRetention(clientId, advisorId);
  const reports = await db.report.aggregate({
    where: { clientId, client: { advisorId } },
    _count: { _all: true },
    _min: { retainUntil: true },
    _max: { retainUntil: true },
  });
  return {
    retentionHold: client.retentionHold,
    revision: client.revision,
    reportRetention: {
      reportCount: reports._count._all,
      earliestRetainUntil: reports._min.retainUntil?.toISOString() ?? null,
      latestRetainUntil: reports._max.retainUntil?.toISOString() ?? null,
    },
  };
}

/**
 * Place or explicitly release a client legal hold. This intentionally never mutates a Report,
 * so each report's immutable retainUntil date is preserved.
 */
export async function changeRetentionHold(clientId: string, advisorId: string, input: Pick<z.infer<typeof retentionChangeSchema>, 'action' | 'reason' | 'revision'>) {
  const parsed = retentionChangeSchema.omit({ csrfToken: true }).safeParse(input);
  if (!parsed.success) throw new ApiError(422, 'Choose a hold action, provide a reason of 500 characters or fewer, and reload the client before trying again.');
  const { action, reason, revision } = parsed.data;
  const desiredHold = action === 'hold';
  const current = await ownedClientRetention(clientId, advisorId);
  if (current.revision !== revision || current.retentionHold === desiredHold) throw retentionConflict(action);

  return db.$transaction(async (tx) => {
    const claim = await tx.client.updateMany({
      where: { id: clientId, advisorId, revision, retentionHold: !desiredHold },
      data: { retentionHold: desiredHold, revision: { increment: 1 } },
    });
    if (!claim.count) throw retentionConflict(action);

    // This is scoped to the authenticated advisor whose owned client was just claimed.
    const advisor = await tx.advisor.findFirst({
      where: { id: advisorId },
      select: { reportSettingsEncrypted: true },
    });
    if (!advisor) throw new ApiError(401, 'Authentication is required.');
    const encryptedSettings = settingsWithRetentionReason(advisor.reportSettingsEncrypted, clientId, action, reason);
    const saved = await tx.advisor.updateMany({ where: { id: advisorId, reportSettingsEncrypted: advisor.reportSettingsEncrypted }, data: { reportSettingsEncrypted: encryptedSettings } });
    if (!saved.count) throw new ApiError(409, 'Advisor settings changed elsewhere. Reload before changing this legal hold.');

    const actionCode = action === 'hold' ? 'RETENTION_HOLD_PLACED' : 'RETENTION_HOLD_RELEASED';
    await tx.auditLog.create({
      data: {
        advisorId,
        clientId,
        action: actionCode,
        entity: 'ClientRetention',
        entityId: clientId,
        // Code-only summary: the private reason must never be copied into AuditLog.
        summary: actionCode,
      },
    });
    return { retentionHold: desiredHold, revision: revision + 1 };
  });
}
