import { chmod, lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertRecoveryBundleAllowed,
  createRecoveryBundle,
  restoreRecoveryBundle,
  sanitizeRuntimeEnvMetadata,
  verifyRecoveryBundle,
} from '../scripts/recovery-bundle';

const temporaryRoots: string[] = [];
const fixtureKey = Buffer.alloc(32, 37).toString('base64');
const fixtureEnv = { NODE_ENV: 'test', RECOVERY_BUNDLE_EXECUTE: 'true', BACKUP_ENCRYPTION_KEY: fixtureKey };

async function writeFixtureFile(root: string, relativePath: string, contents: string): Promise<void> {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

async function syntheticProject(): Promise<{ root: string; output: string; runtimeEnv: string }> {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'retireplan-recovery-bundle-'));
  temporaryRoots.push(temporaryRoot);
  const root = path.join(temporaryRoot, 'project');
  const output = path.join(temporaryRoot, 'private-bundles');
  const runtimeEnv = path.join(temporaryRoot, 'runtime.env');
  await mkdir(root);

  await Promise.all([
    writeFixtureFile(root, 'package.json', '{"name":"synthetic"}\n'),
    writeFixtureFile(root, 'pnpm-lock.yaml', 'lockfileVersion: 9\n'),
    writeFixtureFile(root, 'pnpm-workspace.yaml', 'packages: []\n'),
    writeFixtureFile(root, 'next.config.ts', 'export default {};\n'),
    writeFixtureFile(root, 'app.config.ts', 'export default {};\n'),
    writeFixtureFile(root, 'tsconfig.json', '{"compilerOptions":{}}\n'),
    writeFixtureFile(root, 'vitest.config.ts', 'export default {};\n'),
    writeFixtureFile(root, 'app/page.tsx', 'export default function Page() { return <main>RUNTIME_APPLICATION_MARKER</main>; }\n'),
    writeFixtureFile(root, 'components/auth/LoginForm.tsx', 'export const Component = () => <main>COMPONENT_MARKER</main>;\n'),
    writeFixtureFile(root, 'lib/operations/jobs.ts', 'export const schedulerMarker = "SCHEDULER_MARKER";\n'),
    writeFixtureFile(root, 'prisma/schema.prisma', 'generator client { provider = "prisma-client-js" }\n'),
    writeFixtureFile(root, 'prisma/migrations/001/migration.sql', 'CREATE TABLE only_schema (id INT);\n'),
    writeFixtureFile(root, 'public/brand.svg', '<svg>PUBLIC_ASSET_MARKER</svg>\n'),
    writeFixtureFile(root, 'public/private-report.pdf', 'PRIVATE_PDF_MUST_NOT_BE_INCLUDED'),
    writeFixtureFile(root, 'public/collection.log', 'LOG_MUST_NOT_BE_INCLUDED'),
    writeFixtureFile(root, 'public/logs/runtime.txt', 'TEXT_LOG_MUST_NOT_BE_INCLUDED'),
    writeFixtureFile(root, 'app/audit-log.json', 'JSON_LOG_MUST_NOT_BE_INCLUDED'),
    writeFixtureFile(root, 'public/.env.saved', 'ENV_MUST_NOT_BE_INCLUDED'),
    writeFixtureFile(root, 'public/node_modules/dependency.js', 'DEPENDENCY_MUST_NOT_BE_INCLUDED'),
    writeFixtureFile(root, 'deploy/native/retireplan-backup.service', '[Service]\nExecStart=/opt/retireplan/scripts/backup-create.ts\n'),
    writeFixtureFile(root, 'deploy/native/retireplan-backup.timer', '[Timer]\nOnCalendar=*-*-* 03:00:00 UTC\n'),
    writeFixtureFile(root, 'deploy/native/retireplan-public.nginx.conf', 'server { listen 443 ssl; }\n'),
    writeFixtureFile(root, 'scripts/operations-dispatch.ts', 'export const dispatchMarker = "DISPATCH_MARKER";\n'),
    writeFile(runtimeEnv, [
      'APP_ORIGIN=https://plan.example.test',
      'PORT=3117',
      'INTAKE_ENABLED=false',
      'DEPLOYMENT_ID=release-20261021',
      'BUILD_DATE=2026-10-21',
      'HOSTINGER_MAIL_API_TOKEN=fictional-token-not-for-bundle',
      'DATABASE_URL=mysql://fictional:fictional@db.example.test/retireplan',
      'UNRELATED_VALUE=not-allowed',
    ].join('\n')),
  ]);
  return { root, output, runtimeEnv };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('recovery bundle safeguards', () => {
  it('fails closed unless an explicit execution fixture opens the gate', () => {
    expect(() => assertRecoveryBundleAllowed({ BACKUP_ENCRYPTION_KEY: fixtureKey, NODE_ENV: 'test' })).toThrow('RECOVERY_BUNDLE_EXECUTE=true');
    expect(() => assertRecoveryBundleAllowed({ ...fixtureEnv, NODE_ENV: 'production' })).toThrow('RECOVERY_BUNDLE_APPROVED=true');
    expect(() => assertRecoveryBundleAllowed(fixtureEnv)).not.toThrow();
  });

  it('keeps only safe runtime metadata and omits credential-like values', () => {
    expect(sanitizeRuntimeEnvMetadata([
      'APP_ORIGIN=https://plan.example.test',
      'PORT=3117',
      'INTAKE_ENABLED=true',
      'DEPLOYMENT_ID=release-1',
      'HOSTINGER_MAIL_API_TOKEN=fictional-token',
      'DATABASE_URL=mysql://fictional:fictional@db.example.test/retireplan',
      'APP_ORIGIN=https://user:password@plan.example.test',
    ].join('\n'))).toEqual({ PORT: '3117', INTAKE_ENABLED: 'true', DEPLOYMENT_ID: 'release-1' });
  });

  it('encrypts the explicit application/configuration/schema/scheduler allowlist with private artifacts and a names-only custody manifest', async () => {
    const fixture = await syntheticProject();
    const result = await createRecoveryBundle({ env: fixtureEnv, sourceRoot: fixture.root, outputDir: fixture.output, runtimeEnvPath: fixture.runtimeEnv, now: new Date('2026-10-21T12:00:00.000Z') });
    const artifact = await readFile(result.artifactPath);
    const artifactMode = (await lstat(result.artifactPath)).mode & 0o777;
    const outputMode = (await lstat(fixture.output)).mode & 0o777;
    const manifestContents = await readFile(result.manifestPath, 'utf8');

    expect(artifact).not.toContain(Buffer.from('RUNTIME_APPLICATION_MARKER'));
    expect(artifactMode).toBe(0o600);
    expect(outputMode).toBe(0o700);
    expect(result.manifest.requiredSeparateKeyCustody).toEqual(['BACKUP_ENCRYPTION_KEY']);
    expect(manifestContents).not.toContain(fixtureKey);
    expect(result.manifest.databaseDumpIncluded).toBe(false);
    expect(result.manifest.runtimeEnvIncluded).toBe(false);
    expect(result.manifest.runtimeMetadataKeys).toEqual(['APP_ORIGIN', 'BUILD_DATE', 'DEPLOYMENT_ID', 'INTAKE_ENABLED', 'PORT']);
    expect(result.manifest.sourceFiles.map((file) => file.path)).toEqual(expect.arrayContaining([
      'app/page.tsx',
      'components/auth/LoginForm.tsx',
      'lib/operations/jobs.ts',
      'prisma/schema.prisma',
      'prisma/migrations/001/migration.sql',
      'public/brand.svg',
      'deploy/native/retireplan-backup.service',
      'deploy/native/retireplan-backup.timer',
      'deploy/native/retireplan-public.nginx.conf',
      'scripts/operations-dispatch.ts',
      'package.json',
      'pnpm-lock.yaml',
    ]));
    for (const excluded of ['public/private-report.pdf', 'public/collection.log', 'public/logs/runtime.txt', 'app/audit-log.json', 'public/.env.saved', 'public/node_modules/dependency.js', 'runtime.env']) {
      expect(result.manifest.sourceFiles.map((file) => file.path)).not.toContain(excluded);
    }
    await expect(verifyRecoveryBundle(result.artifactPath, fixtureKey)).resolves.toMatchObject({
      fileCount: result.manifest.fileCount,
      runtimeMetadataKeys: ['APP_ORIGIN', 'BUILD_DATE', 'DEPLOYMENT_ID', 'INTAKE_ENABLED', 'PORT'],
    });
  });

  it('authenticates the whole bundle before creating a fresh isolated restore and never overwrites that destination', async () => {
    const fixture = await syntheticProject();
    const result = await createRecoveryBundle({ env: fixtureEnv, sourceRoot: fixture.root, outputDir: fixture.output, runtimeEnvPath: fixture.runtimeEnv });
    const restoreDirectory = path.join(path.dirname(fixture.root), 'isolated-restore');
    const restored = await restoreRecoveryBundle(result.artifactPath, { env: fixtureEnv, sourceRoot: fixture.root, destination: restoreDirectory });

    expect(await readFile(path.join(restoreDirectory, 'app/page.tsx'), 'utf8')).toContain('RUNTIME_APPLICATION_MARKER');
    expect(await readFile(path.join(restoreDirectory, 'components/auth/LoginForm.tsx'), 'utf8')).toContain('COMPONENT_MARKER');
    expect(await readFile(path.join(restoreDirectory, 'public/brand.svg'), 'utf8')).toContain('PUBLIC_ASSET_MARKER');
    await expect(lstat(path.join(restoreDirectory, 'runtime.env'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(restored.runtimeMetadata).toEqual({ APP_ORIGIN: 'https://plan.example.test', PORT: '3117', INTAKE_ENABLED: 'false', DEPLOYMENT_ID: 'release-20261021', BUILD_DATE: '2026-10-21' });
    await expect(restoreRecoveryBundle(result.artifactPath, { env: fixtureEnv, sourceRoot: fixture.root, destination: restoreDirectory })).rejects.toThrow('must not already exist');

    const tamperedArtifact = path.join(fixture.output, 'tampered.bundle.aesgcm');
    const tampered = Buffer.from(await readFile(result.artifactPath));
    tampered[tampered.length - 1] ^= 1;
    await writeFile(tamperedArtifact, tampered);
    const blockedDestination = path.join(path.dirname(fixture.root), 'blocked-before-authentication');
    await expect(restoreRecoveryBundle(tamperedArtifact, { env: fixtureEnv, sourceRoot: fixture.root, destination: blockedDestination })).rejects.toThrow('authentication failed');
    await expect(lstat(blockedDestination)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects symbolic links in an allowlisted source rather than following them', async () => {
    const fixture = await syntheticProject();
    const outside = path.join(path.dirname(fixture.root), 'outside.ts');
    await writeFile(outside, 'export const outside = true;\n');
    await symlink(outside, path.join(fixture.root, 'app', 'escape.ts'));
    await expect(createRecoveryBundle({ env: fixtureEnv, sourceRoot: fixture.root, outputDir: fixture.output })).rejects.toThrow('symbolic links');
    await chmod(fixture.root, 0o700);
  });
});
