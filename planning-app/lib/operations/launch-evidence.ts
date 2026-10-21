import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

type Environment = Record<string, string | undefined>;
const iso = z.string().refine((value) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const evidenceSchema = z.object({
  version: z.literal(1),
  origin: z.string(),
  ownerApproval: z.object({
    advisorId: z.string().min(1),
    policySha256: digest,
    policyVersion: z.literal('2026-10-21'),
    approvedAt: iso,
    choice: z.enum(['APPROVE_WITH_IMPORT', 'APPROVE_WITHOUT_IMPORT']),
  }).strict(),
  offhostRecovery: z.object({
    provider: z.literal('GOOGLE_DRIVE'),
    artifactId: z.string().min(1).max(256),
    cipherSha256: digest,
    restoreVerifiedAt: iso,
    databaseRestoreVerified: z.literal(true),
    applicationRestoreVerified: z.literal(true),
    separateKeyCustodyVerified: z.literal(true),
    encryptedRecoveryKitId: z.string().min(1).max(256),
  }).strict(),
  mail: z.object({ providerHttp: z.literal(204), recipient: z.literal('brokerjesse247@gmail.com'), acceptedAt: iso }).strict(),
}).strict();

/** This validates recorded evidence, not whether a particular retention period satisfies law. */
export function validateLaunchEvidence(raw: unknown, env: Environment, now = new Date()): boolean {
  const parsed = evidenceSchema.safeParse(raw);
  if (!parsed.success) return false;
  const value = parsed.data;
  if (!env.LAUNCH_POLICY_SHA256 || value.ownerApproval.policySha256 !== env.LAUNCH_POLICY_SHA256) return false;
  if (!env.INTAKE_ADVISOR_ID || value.ownerApproval.advisorId !== env.INTAKE_ADVISOR_ID) return false;
  if (value.origin !== env.APP_ORIGIN) return false;
  const approvedAt = Date.parse(value.ownerApproval.approvedAt);
  const restoredAt = Date.parse(value.offhostRecovery.restoreVerifiedAt);
  return approvedAt <= now.valueOf() && restoredAt >= approvedAt && restoredAt <= now.valueOf() && Date.parse(value.mail.acceptedAt) <= now.valueOf();
}

/** App-owned/writable paths and symlinks cannot stand in for an operator's durable approval record. */
export function hasVerifiedLaunchEvidence(env: Environment = process.env): boolean {
  const file = env.LAUNCH_EVIDENCE_PATH ?? '/etc/retireplan-evidence/launch.json';
  if (!file.startsWith('/etc/retireplan-evidence/') || path.normalize(file) !== file) return false;
  try {
    const directory = lstatSync('/etc/retireplan-evidence');
    const info = lstatSync(file);
    if (!directory.isDirectory() || directory.isSymbolicLink() || directory.uid !== 0 || (directory.mode & 0o022) !== 0) return false;
    if (!info.isFile() || info.isSymbolicLink() || info.uid !== 0 || (info.mode & 0o027) !== 0 || info.size > 16 * 1024) return false;
    return validateLaunchEvidence(JSON.parse(readFileSync(file, 'utf8')), env);
  } catch { return false; }
}
