import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, link, lstat, mkdir, open, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

type Environment = Record<string, string | undefined>;

export type RecoveryBundleOptions = {
  env?: Environment;
  sourceRoot?: string;
  outputDir?: string;
  runtimeEnvPath?: string;
  now?: Date;
  maxFileBytes?: number;
  maxTotalBytes?: number;
};

export type RestoreRecoveryBundleOptions = {
  env?: Environment;
  sourceRoot?: string;
  destination: string;
};

type RecoveryFile = {
  path: string;
  mode: number;
  size: number;
  sha256: string;
  contentBase64: string;
};

type RecoveryPayload = {
  format: 'retireplan-recovery-bundle/v1';
  createdAt: string;
  requiredSeparateKeyCustody: string[];
  runtimeMetadata: Record<string, string>;
  files: RecoveryFile[];
};

export type RecoveryBundleManifest = {
  format: 'retireplan-recovery-bundle-manifest/v1';
  createdAt: string;
  artifact: string;
  artifactSha256: string;
  encryptedBytes: number;
  fileCount: number;
  sourceBytes: number;
  sourceFiles: Array<{ path: string; size: number; sha256: string }>;
  runtimeMetadataKeys: string[];
  requiredSeparateKeyCustody: string[];
  databaseDumpIncluded: false;
  runtimeEnvIncluded: false;
};

export const RECOVERY_BUNDLE_MAGIC = Buffer.from('RPRB1', 'ascii');
const IV_BYTES = 12;
const TAG_BYTES = 16;
const DEFAULT_MAX_FILE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_ENVELOPE_BYTES = 96 * 1024 * 1024;
const MAX_RUNTIME_ENV_BYTES = 1024 * 1024;
const KEY_CUSTODY_NAMES = ['BACKUP_ENCRYPTION_KEY'];

const SOURCE_DIRECTORIES = ['app', 'components', 'lib', 'prisma', 'public', 'deploy/native', 'scripts'] as const;
const ROOT_CONFIG_FILES = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'next.config.ts',
  'app.config.ts',
  'tsconfig.json',
  'vitest.config.ts',
] as const;
const ALLOWED_FILE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.yaml', '.yml', '.toml', '.prisma', '.sql',
  '.css', '.svg', '.html', '.txt', '.md', '.sh', '.service', '.timer', '.conf',
  '.ttf', '.otf', '.woff', '.woff2',
]);
const EXCLUDED_DIRECTORY_NAMES = new Set(['node_modules', '.git', '.next', 'cache', 'log', 'logs']);
const SENSITIVE_FILE_PATTERN = /(?:^|[._-])(?:credential|credentials|secret|secrets|private[-_]?key|ssh|id_rsa|authorized_keys)(?:[._-]|$)|\.(?:pem|key|p12|pfx|crt)$/i;

const FLAG_METADATA_KEYS = new Set([
  'INTAKE_ENABLED',
  'PUBLIC_INTAKE_ENABLED',
  'MAIL_DISPATCH_ENABLED',
  'OUTBOX_DISPATCH_ENABLED',
  'OPERATIONS_SCHEDULER_ENABLED',
  'BACKUP_SCHEDULE_ENABLED',
  'MAINTENANCE_MODE',
]);
const PORT_METADATA_KEYS = new Set(['PORT', 'INTERNAL_PORT', 'APP_PORT', 'OPERATIONS_PORT']);
const DATE_METADATA_KEYS = new Set(['APP_DEPLOYED_AT', 'DEPLOYED_AT', 'DEPLOYMENT_DATE', 'BUILD_DATE']);
const ID_METADATA_KEYS = new Set(['DEPLOYMENT_ID', 'RELEASE_ID', 'BUILD_ID']);
const SAFE_RUNTIME_METADATA_KEYS = new Set([
  'APP_ORIGIN', 'NODE_ENV', ...FLAG_METADATA_KEYS, ...PORT_METADATA_KEYS, ...DATE_METADATA_KEYS, ...ID_METADATA_KEYS,
]);

function required(env: Environment, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function isWithin(base: string, candidate: string): boolean {
  const relative = path.relative(base, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function toBundlePath(value: string): string {
  return value.split(path.sep).join('/');
}

function safeFileMode(mode: number): number {
  // Preserve useful execute bits (for start-app.sh) but never restore group/world write bits.
  return mode & 0o755;
}

function limits(options: RecoveryBundleOptions): { maxFileBytes: number; maxTotalBytes: number } {
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  if (!Number.isInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > DEFAULT_MAX_FILE_BYTES) {
    throw new Error(`Recovery bundle file limit must be an integer from 1 through ${DEFAULT_MAX_FILE_BYTES}.`);
  }
  if (!Number.isInteger(maxTotalBytes) || maxTotalBytes < maxFileBytes || maxTotalBytes > DEFAULT_MAX_TOTAL_BYTES) {
    throw new Error(`Recovery bundle total limit must be an integer from the file limit through ${DEFAULT_MAX_TOTAL_BYTES}.`);
  }
  return { maxFileBytes, maxTotalBytes };
}

/** Validates a supplied recovery key without reading any .env file or writing the key anywhere. */
export function recoveryBundleEncryptionKey(value: string | undefined): Buffer {
  if (!value) throw new Error('BACKUP_ENCRYPTION_KEY is required.');
  if (/^[a-fA-F0-9]{64}$/.test(value)) return Buffer.from(value, 'hex');
  if (!/^[A-Za-z0-9+/]{42,43}={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be a 32-byte base64 or hex value.');
  }
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must be a 32-byte base64 or hex value.');
  return key;
}

/** Generation and extraction are deliberately closed until an explicit operator environment opens them. */
export function assertRecoveryBundleAllowed(env: Environment = process.env): void {
  if (env.RECOVERY_BUNDLE_EXECUTE !== 'true') {
    throw new Error('Recovery bundle execution is disabled; set RECOVERY_BUNDLE_EXECUTE=true only in an approved operator environment.');
  }
  if (env.NODE_ENV === 'production' && env.RECOVERY_BUNDLE_APPROVED !== 'true') {
    throw new Error('Production recovery bundle generation or extraction requires RECOVERY_BUNDLE_APPROVED=true.');
  }
  recoveryBundleEncryptionKey(env.BACKUP_ENCRYPTION_KEY);
}

function hasExcludedSegment(bundlePath: string): boolean {
  const segments = bundlePath.split('/');
  return segments.some((segment) => EXCLUDED_DIRECTORY_NAMES.has(segment.toLowerCase()));
}

function hasSensitiveName(bundlePath: string): boolean {
  const basename = path.posix.basename(bundlePath);
  const logArtifact = ['.txt', '.json', '.jsonl', '.md', '.csv', '.log'].includes(path.posix.extname(basename).toLowerCase()) && /(?:^|[._-])logs?(?:[._-]|$)/i.test(basename);
  return logArtifact || basename === 'runtime.env' || basename.startsWith('.env') || SENSITIVE_FILE_PATTERN.test(basename);
}

function extensionAllowed(bundlePath: string): boolean {
  return ALLOWED_FILE_EXTENSIONS.has(path.posix.extname(bundlePath).toLowerCase());
}

function isAllowedBundleFilePath(bundlePath: string): boolean {
  if (!bundlePath || bundlePath.startsWith('/') || bundlePath.includes('\\') || bundlePath.includes('\0')) return false;
  const normalized = path.posix.normalize(bundlePath);
  if (normalized !== bundlePath || normalized === '.' || normalized.startsWith('../') || bundlePath.includes('/../')) return false;
  if (hasExcludedSegment(bundlePath) || hasSensitiveName(bundlePath)) return false;
  if ((ROOT_CONFIG_FILES as readonly string[]).includes(bundlePath)) return true;
  return SOURCE_DIRECTORIES.some((directory) => bundlePath.startsWith(`${directory}/`)) && extensionAllowed(bundlePath);
}

function shouldSkipSourcePath(bundlePath: string): boolean {
  return hasExcludedSegment(bundlePath) || hasSensitiveName(bundlePath) || !extensionAllowed(bundlePath);
}

async function regularFileInfo(absolutePath: string): Promise<{ size: number; mode: number }> {
  const info = await lstat(absolutePath);
  if (info.isSymbolicLink()) throw new Error('Recovery bundle source cannot contain symbolic links.');
  if (!info.isFile()) throw new Error('Recovery bundle source must contain regular files only.');
  return { size: info.size, mode: info.mode };
}

async function readSourceFile(
  absolutePath: string,
  sourceRootReal: string,
  maxFileBytes: number,
): Promise<{ content: Buffer; mode: number }> {
  const resolved = await realpath(absolutePath);
  if (!isWithin(sourceRootReal, resolved)) throw new Error('Recovery bundle source escaped its allowlisted root.');
  const handle = await open(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('Recovery bundle source must contain regular files only.');
    if (info.size > maxFileBytes) throw new Error('Recovery bundle source file exceeds the configured size limit.');
    const content = await handle.readFile();
    if (content.length !== info.size || content.length > maxFileBytes) {
      throw new Error('Recovery bundle source changed during collection or exceeds the configured size limit.');
    }
    return { content, mode: safeFileMode(info.mode) };
  } finally {
    await handle.close();
  }
}

async function collectDirectoryFiles(
  sourceRoot: string,
  sourceRootReal: string,
  relativeDirectory: string,
  maxFileBytes: number,
  files: RecoveryFile[],
  total: { bytes: number; limit: number },
): Promise<void> {
  const absoluteDirectory = path.join(sourceRoot, relativeDirectory);
  const directoryInfo = await lstat(absoluteDirectory);
  if (directoryInfo.isSymbolicLink()) throw new Error('Recovery bundle source cannot contain symbolic links.');
  if (!directoryInfo.isDirectory()) throw new Error(`Required recovery source directory is missing: ${relativeDirectory}.`);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const relativePath = toBundlePath(path.join(relativeDirectory, entry.name));
    const absolutePath = path.join(sourceRoot, relativePath);
    if (entry.isDirectory()) {
      if (hasExcludedSegment(relativePath) || hasSensitiveName(relativePath)) continue;
      await collectDirectoryFiles(sourceRoot, sourceRootReal, relativePath, maxFileBytes, files, total);
      continue;
    }
    if (entry.isSymbolicLink()) {
      if (shouldSkipSourcePath(relativePath)) continue;
      throw new Error('Recovery bundle source cannot contain symbolic links.');
    }
    if (!entry.isFile()) {
      if (shouldSkipSourcePath(relativePath)) continue;
      throw new Error('Recovery bundle source contains an unsupported filesystem entry.');
    }
    if (shouldSkipSourcePath(relativePath)) continue;
    if (!isAllowedBundleFilePath(relativePath)) throw new Error('Recovery bundle source path is not allowlisted.');
    const info = await regularFileInfo(absolutePath);
    if (info.size > maxFileBytes || total.bytes + info.size > total.limit) {
      throw new Error('Recovery bundle source exceeds its configured size limit.');
    }
    const { content, mode } = await readSourceFile(absolutePath, sourceRootReal, maxFileBytes);
    total.bytes += content.length;
    if (total.bytes > total.limit) throw new Error('Recovery bundle source exceeds its configured size limit.');
    files.push({ path: relativePath, mode, size: content.length, sha256: sha256(content), contentBase64: content.toString('base64') });
  }
}

async function collectRecoveryFiles(sourceRoot: string, options: RecoveryBundleOptions): Promise<{ files: RecoveryFile[]; sourceBytes: number }> {
  const sourceRootReal = await realpath(sourceRoot);
  const rootInfo = await lstat(sourceRootReal);
  if (!rootInfo.isDirectory()) throw new Error('RECOVERY_BUNDLE_SOURCE_ROOT must be a directory.');
  const { maxFileBytes, maxTotalBytes } = limits(options);
  const files: RecoveryFile[] = [];
  const total = { bytes: 0, limit: maxTotalBytes };

  for (const rootFile of ROOT_CONFIG_FILES) {
    const absolutePath = path.join(sourceRootReal, rootFile);
    const info = await regularFileInfo(absolutePath).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`Required recovery configuration file is missing: ${rootFile}.`);
      throw error;
    });
    if (info.size > maxFileBytes || total.bytes + info.size > maxTotalBytes) {
      throw new Error('Recovery bundle source exceeds its configured size limit.');
    }
    const { content, mode } = await readSourceFile(absolutePath, sourceRootReal, maxFileBytes);
    total.bytes += content.length;
    files.push({ path: rootFile, mode, size: content.length, sha256: sha256(content), contentBase64: content.toString('base64') });
  }

  for (const directory of SOURCE_DIRECTORIES) {
    await collectDirectoryFiles(sourceRootReal, sourceRootReal, directory, maxFileBytes, files, total);
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  validatePayload({
    format: 'retireplan-recovery-bundle/v1',
    createdAt: new Date(0).toISOString(),
    requiredSeparateKeyCustody: [...KEY_CUSTODY_NAMES],
    runtimeMetadata: {},
    files,
  });
  return { files, sourceBytes: total.bytes };
}

function parsedRuntimeValue(key: string, value: string): string | undefined {
  if (/(?:KEY|TOKEN|PASSWORD|SECRET|CREDENTIAL)/i.test(key) || !SAFE_RUNTIME_METADATA_KEYS.has(key)) return undefined;
  if (key === 'APP_ORIGIN') {
    try {
      const origin = new URL(value);
      if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') return undefined;
      return origin.origin;
    } catch {
      return undefined;
    }
  }
  if (key === 'NODE_ENV') return /^(development|test|production)$/i.test(value) ? value : undefined;
  if (FLAG_METADATA_KEYS.has(key)) return /^(true|false)$/i.test(value) ? value.toLowerCase() : undefined;
  if (PORT_METADATA_KEYS.has(key)) {
    const port = Number(value);
    return Number.isInteger(port) && port >= 1024 && port <= 65535 ? String(port) : undefined;
  }
  if (DATE_METADATA_KEYS.has(key)) {
    return /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(value) ? value : undefined;
  }
  if (ID_METADATA_KEYS.has(key)) return /^[A-Za-z0-9._-]{1,128}$/.test(value) ? value : undefined;
  return undefined;
}

/** Reads only whitelisted non-secret metadata; it never adds runtime.env itself to the bundle. */
export function sanitizeRuntimeEnvMetadata(contents: string): Record<string, string> {
  if (Buffer.byteLength(contents, 'utf8') > MAX_RUNTIME_ENV_BYTES) throw new Error('runtime.env metadata input exceeds the configured size limit.');
  const metadata: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    const safeValue = parsedRuntimeValue(key, value);
    if (safeValue !== undefined) metadata[key] = safeValue;
    else if (SAFE_RUNTIME_METADATA_KEYS.has(key)) delete metadata[key];
  }
  return metadata;
}

async function readSanitizedRuntimeMetadata(runtimeEnvPath: string | undefined): Promise<Record<string, string>> {
  if (!runtimeEnvPath) return {};
  const info = await lstat(runtimeEnvPath);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error('RECOVERY_BUNDLE_RUNTIME_ENV_PATH must name a regular non-symbolic file.');
  if (info.size > MAX_RUNTIME_ENV_BYTES) throw new Error('runtime.env metadata input exceeds the configured size limit.');
  return sanitizeRuntimeEnvMetadata(await readFile(runtimeEnvPath, 'utf8'));
}

function encryptPayload(payload: RecoveryPayload, key: Buffer): Buffer {
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  if (plaintext.length > MAX_ENVELOPE_BYTES) throw new Error('Recovery bundle envelope exceeds the configured size limit.');
  const nonce = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([RECOVERY_BUNDLE_MAGIC, nonce, ciphertext, cipher.getAuthTag()]);
}

function decodeBase64(value: string): Buffer {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Recovery bundle payload has invalid file content encoding.');
  }
  return Buffer.from(value, 'base64');
}

function validatePayload(value: unknown): asserts value is RecoveryPayload {
  if (!value || typeof value !== 'object') throw new Error('Recovery bundle payload is invalid.');
  const payload = value as Partial<RecoveryPayload>;
  if (payload.format !== 'retireplan-recovery-bundle/v1' || typeof payload.createdAt !== 'string' || !Array.isArray(payload.files)) {
    throw new Error('Recovery bundle payload is invalid.');
  }
  if (!Array.isArray(payload.requiredSeparateKeyCustody) || payload.requiredSeparateKeyCustody.length !== KEY_CUSTODY_NAMES.length || payload.requiredSeparateKeyCustody.some((name, index) => name !== KEY_CUSTODY_NAMES[index])) {
    throw new Error('Recovery bundle key-custody manifest is invalid.');
  }
  if (!payload.runtimeMetadata || typeof payload.runtimeMetadata !== 'object' || Array.isArray(payload.runtimeMetadata)) throw new Error('Recovery bundle runtime metadata is invalid.');
  for (const [key, runtimeValue] of Object.entries(payload.runtimeMetadata)) {
    if (typeof runtimeValue !== 'string' || parsedRuntimeValue(key, runtimeValue) !== runtimeValue) throw new Error('Recovery bundle runtime metadata is invalid.');
  }

  const paths = new Set<string>();
  let totalBytes = 0;
  for (const file of payload.files) {
    if (!file || typeof file !== 'object' || typeof file.path !== 'string' || !isAllowedBundleFilePath(file.path) || paths.has(file.path)) {
      throw new Error('Recovery bundle file manifest is invalid.');
    }
    if (!Number.isInteger(file.mode) || file.mode < 0 || file.mode > 0o777 || !Number.isInteger(file.size) || file.size < 0 || file.size > DEFAULT_MAX_FILE_BYTES || !/^[a-f0-9]{64}$/.test(file.sha256) || typeof file.contentBase64 !== 'string') {
      throw new Error('Recovery bundle file manifest is invalid.');
    }
    const content = decodeBase64(file.contentBase64);
    if (content.length !== file.size || sha256(content) !== file.sha256) throw new Error('Recovery bundle file integrity check failed.');
    totalBytes += content.length;
    if (totalBytes > DEFAULT_MAX_TOTAL_BYTES) throw new Error('Recovery bundle source exceeds the configured size limit.');
    paths.add(file.path);
  }
  for (const rootFile of ROOT_CONFIG_FILES) {
    if (!paths.has(rootFile)) throw new Error(`Recovery bundle is missing required configuration coverage: ${rootFile}.`);
  }
  for (const directory of SOURCE_DIRECTORIES) {
    if (!payload.files.some((file) => file.path.startsWith(`${directory}/`))) {
      throw new Error(`Recovery bundle is missing required source coverage: ${directory}.`);
    }
  }
}

function decryptPayload(envelope: Buffer, key: Buffer): RecoveryPayload {
  const headerBytes = RECOVERY_BUNDLE_MAGIC.length + IV_BYTES;
  if (envelope.length < headerBytes + TAG_BYTES || envelope.length > MAX_ENVELOPE_BYTES + headerBytes + TAG_BYTES || !envelope.subarray(0, RECOVERY_BUNDLE_MAGIC.length).equals(RECOVERY_BUNDLE_MAGIC)) {
    throw new Error('Invalid recovery bundle envelope.');
  }
  try {
    const nonce = envelope.subarray(RECOVERY_BUNDLE_MAGIC.length, headerBytes);
    const tag = envelope.subarray(envelope.length - TAG_BYTES);
    const ciphertext = envelope.subarray(headerBytes, envelope.length - TAG_BYTES);
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (plaintext.length > MAX_ENVELOPE_BYTES) throw new Error('Recovery bundle envelope exceeds the configured size limit.');
    const payload: unknown = JSON.parse(plaintext.toString('utf8'));
    validatePayload(payload);
    return payload;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Recovery bundle')) throw error;
    throw new Error('Recovery bundle authentication failed.');
  }
}

async function readAuthenticatedPayload(source: string, key: Buffer): Promise<RecoveryPayload> {
  const sourceInfo = await lstat(source);
  if (sourceInfo.isSymbolicLink() || !sourceInfo.isFile()) throw new Error('Recovery bundle artifact must be a regular non-symbolic file.');
  if (sourceInfo.size > MAX_ENVELOPE_BYTES + RECOVERY_BUNDLE_MAGIC.length + IV_BYTES + TAG_BYTES) {
    throw new Error('Recovery bundle envelope exceeds the configured size limit.');
  }
  return decryptPayload(await readFile(source), key);
}

async function ensurePrivateOutputDirectory(rawDirectory: string, sourceRootReal: string): Promise<string> {
  if (!path.isAbsolute(rawDirectory)) throw new Error('RECOVERY_BUNDLE_OUTPUT_DIR must be an absolute private directory.');
  const directory = path.resolve(rawDirectory);
  if (directory === path.parse(directory).root || directory.split(path.sep).some((segment) => segment.toLowerCase() === 'public')) {
    throw new Error('Recovery bundle output must not be a public or filesystem-root directory.');
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('RECOVERY_BUNDLE_OUTPUT_DIR must be a real directory.');
  await chmod(directory, 0o700);
  const resolved = await realpath(directory);
  if (isWithin(sourceRootReal, resolved)) throw new Error('Recovery bundle output must be outside the source root.');
  return resolved;
}

async function writePrivateAtomically(directory: string, name: string, contents: Uint8Array): Promise<string> {
  const finalPath = path.join(directory, name);
  const temporaryPath = path.join(directory, `.${name}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    await writeFile(temporaryPath, contents, { mode: 0o600, flag: 'wx' });
    await chmod(temporaryPath, 0o600);
    // link(2) fails on EEXIST, unlike rename(2), so it cannot replace a previous artifact.
    await link(temporaryPath, finalPath);
    await chmod(finalPath, 0o600);
    await rm(temporaryPath, { force: true });
    return finalPath;
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function utcFileStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Creates a bounded, encrypted code/configuration recovery bundle. It intentionally contains no
 * database dump, uploads, PDFs, credentials, raw runtime.env file, or external destination logic.
 */
export async function createRecoveryBundle(options: RecoveryBundleOptions = {}): Promise<{
  artifactPath: string;
  manifestPath: string;
  manifest: RecoveryBundleManifest;
}> {
  const env = options.env ?? process.env;
  assertRecoveryBundleAllowed(env);
  const sourceRoot = path.resolve(options.sourceRoot ?? process.cwd());
  const sourceRootInfo = await lstat(sourceRoot);
  if (sourceRootInfo.isSymbolicLink() || !sourceRootInfo.isDirectory()) throw new Error('RECOVERY_BUNDLE_SOURCE_ROOT must be a real directory.');
  const sourceRootReal = await realpath(sourceRoot);
  const outputDirectory = await ensurePrivateOutputDirectory(options.outputDir ?? required(env, 'RECOVERY_BUNDLE_OUTPUT_DIR'), sourceRootReal);
  const { files, sourceBytes } = await collectRecoveryFiles(sourceRootReal, options);
  const runtimeMetadata = await readSanitizedRuntimeMetadata(options.runtimeEnvPath ?? env.RECOVERY_BUNDLE_RUNTIME_ENV_PATH);
  const createdAt = (options.now ?? new Date()).toISOString();
  const envelope = encryptPayload({
    format: 'retireplan-recovery-bundle/v1',
    createdAt,
    requiredSeparateKeyCustody: [...KEY_CUSTODY_NAMES],
    runtimeMetadata,
    files,
  }, recoveryBundleEncryptionKey(env.BACKUP_ENCRYPTION_KEY));

  const stem = `retireplan-recovery-${utcFileStamp(new Date(createdAt))}-${randomBytes(6).toString('hex')}`;
  const artifactName = `${stem}.bundle.aesgcm`;
  let artifactPath: string | undefined;
  let manifestPath: string | undefined;
  try {
    artifactPath = await writePrivateAtomically(outputDirectory, artifactName, envelope);
    const manifest: RecoveryBundleManifest = {
      format: 'retireplan-recovery-bundle-manifest/v1',
      createdAt,
      artifact: artifactName,
      artifactSha256: sha256(envelope),
      encryptedBytes: envelope.length,
      fileCount: files.length,
      sourceBytes,
      sourceFiles: files.map((file) => ({ path: file.path, size: file.size, sha256: file.sha256 })),
      runtimeMetadataKeys: Object.keys(runtimeMetadata).sort(),
      requiredSeparateKeyCustody: [...KEY_CUSTODY_NAMES],
      databaseDumpIncluded: false,
      runtimeEnvIncluded: false,
    };
    manifestPath = await writePrivateAtomically(outputDirectory, `${stem}.manifest.json`, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'));
    return { artifactPath, manifestPath, manifest };
  } catch (error) {
    // Both names are unique to this invocation, so cleanup cannot remove a previous bundle.
    if (manifestPath) await rm(manifestPath, { force: true });
    if (artifactPath) await rm(artifactPath, { force: true });
    throw error;
  }
}

/** Authenticates and validates every encrypted byte before returning any bundle metadata. */
export async function verifyRecoveryBundle(source: string, keyValue: string | undefined): Promise<{
  fileCount: number;
  sourceBytes: number;
  runtimeMetadataKeys: string[];
}> {
  const payload = await readAuthenticatedPayload(source, recoveryBundleEncryptionKey(keyValue));
  return {
    fileCount: payload.files.length,
    sourceBytes: payload.files.reduce((total, file) => total + file.size, 0),
    runtimeMetadataKeys: Object.keys(payload.runtimeMetadata).sort(),
  };
}

async function createFreshIsolatedDestination(rawDestination: string, sourceRoot: string | undefined): Promise<string> {
  if (!path.isAbsolute(rawDestination)) throw new Error('RECOVERY_BUNDLE_RESTORE_DIR must be an absolute fresh isolated directory.');
  const destination = path.resolve(rawDestination);
  if (destination === path.parse(destination).root || destination.split(path.sep).some((segment) => segment.toLowerCase() === 'public')) {
    throw new Error('Recovery extraction destination must not be public or filesystem root.');
  }
  const sourceRootReal = sourceRoot ? await realpath(sourceRoot) : undefined;
  if (sourceRootReal && isWithin(sourceRootReal, destination)) {
    throw new Error('Recovery extraction destination must be outside the source root.');
  }
  try {
    await lstat(destination);
    throw new Error('Recovery extraction destination must not already exist.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await mkdir(destination, { mode: 0o700 });
  await chmod(destination, 0o700);
  const resolvedDestination = await realpath(destination);
  if (sourceRootReal && isWithin(sourceRootReal, resolvedDestination)) {
    await rm(destination, { recursive: true, force: true });
    throw new Error('Recovery extraction destination must be outside the source root.');
  }
  const info = await lstat(resolvedDestination);
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Recovery extraction destination is unsafe.');
  return resolvedDestination;
}

/**
 * Authenticates and fully validates the complete envelope first, then extracts only into a new,
 * isolated directory. Any failed extraction removes that newly-created destination.
 */
export async function restoreRecoveryBundle(source: string, options: RestoreRecoveryBundleOptions): Promise<{
  destination: string;
  fileCount: number;
  runtimeMetadata: Record<string, string>;
}> {
  const env = options.env ?? process.env;
  assertRecoveryBundleAllowed(env);
  const payload = await readAuthenticatedPayload(source, recoveryBundleEncryptionKey(env.BACKUP_ENCRYPTION_KEY));
  // No destination is created until AES-GCM authentication and all path/digest checks have completed.
  const destination = await createFreshIsolatedDestination(options.destination, options.sourceRoot ?? process.cwd());
  try {
    for (const file of payload.files) {
      const target = path.resolve(destination, file.path);
      if (!isWithin(destination, target)) throw new Error('Recovery bundle contains an unsafe extraction path.');
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, decodeBase64(file.contentBase64), { mode: 0o600, flag: 'wx' });
      await chmod(target, safeFileMode(file.mode));
    }
    return { destination, fileCount: payload.files.length, runtimeMetadata: payload.runtimeMetadata };
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}

function valueAfterFlag(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1] || process.argv[index + 1].startsWith('--')) return undefined;
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  // Deliberately do not load .env.local: real runtime credentials must remain outside this tool's inputs.
  assertRecoveryBundleAllowed(process.env);
  const verifySource = valueAfterFlag('--verify');
  const restoreSource = valueAfterFlag('--restore');
  if (verifySource && restoreSource) throw new Error('Choose either --verify or --restore, not both.');
  if (verifySource) {
    const result = await verifyRecoveryBundle(verifySource, process.env.BACKUP_ENCRYPTION_KEY);
    process.stdout.write(`${JSON.stringify({ ok: true, mode: 'verify', file: path.basename(verifySource), files: result.fileCount })}\n`);
    return;
  }
  if (restoreSource) {
    const destination = valueAfterFlag('--restore-dir') ?? process.env.RECOVERY_BUNDLE_RESTORE_DIR;
    if (!destination) throw new Error('Provide --restore-dir or RECOVERY_BUNDLE_RESTORE_DIR.');
    const result = await restoreRecoveryBundle(restoreSource, { env: process.env, destination });
    process.stdout.write(`${JSON.stringify({ ok: true, mode: 'isolated-restore', file: path.basename(restoreSource), files: result.fileCount })}\n`);
    return;
  }
  const result = await createRecoveryBundle();
  process.stdout.write(`${JSON.stringify({ ok: true, mode: 'create', file: path.basename(result.artifactPath), files: result.manifest.fileCount })}\n`);
}

if (process.argv[1]?.endsWith('recovery-bundle.ts')) {
  main().catch(() => {
    process.stderr.write('Recovery bundle operation failed.\n');
    process.exitCode = 1;
  });
}
