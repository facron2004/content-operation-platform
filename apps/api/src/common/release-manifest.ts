import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { MIGRATION_POLICY_FILENAME, readMigrationPolicy } from './migration-policy';

export type ReleaseManifestMigration = { name: string; sha256: string };

export type ReleaseManifest = {
  version: string;
  commit: string;
  builtAt: string;
  schemaSha256: string;
  migrationPolicySha256?: string;
  migrations: ReleaseManifestMigration[];
};

export type ReleaseManifestStatus = {
  manifest: ReleaseManifest | null;
  expectedMigrationFingerprint: string | null;
  valid: boolean;
};

export function resolveReleaseVersion(
  status: ReleaseManifestStatus = getReleaseManifestStatus()
): string {
  return status.manifest?.version || process.env.APP_VERSION?.trim() || 'unknown';
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

function hashFile(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function fingerprintMigrationEntries(entries: ReleaseManifestMigration[]): string {
  const normalized = [...entries]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => `${entry.name}:${entry.sha256}`)
    .join('\n');
  return createHash('sha256').update(normalized).digest('hex');
}

export function readMigrationEntries(migrationsPath: string): ReleaseManifestMigration[] | null {
  if (!existsSync(migrationsPath)) return null;

  const entries: ReleaseManifestMigration[] = [];
  for (const entry of readdirSync(migrationsPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const migrationFile = path.join(migrationsPath, entry.name, 'migration.sql');
    if (!existsSync(migrationFile)) return null;
    entries.push({ name: entry.name, sha256: hashFile(migrationFile) });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function parseManifest(value: unknown): ReleaseManifest | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.version !== 'string' ||
    typeof candidate.commit !== 'string' ||
    typeof candidate.builtAt !== 'string' ||
    typeof candidate.schemaSha256 !== 'string' ||
    !SHA256_PATTERN.test(candidate.schemaSha256) ||
    !Array.isArray(candidate.migrations) ||
    (candidate.migrationPolicySha256 !== undefined &&
      (typeof candidate.migrationPolicySha256 !== 'string' ||
        !SHA256_PATTERN.test(candidate.migrationPolicySha256)))
  ) {
    return null;
  }

  const migrations: ReleaseManifestMigration[] = [];
  for (const migration of candidate.migrations) {
    if (!migration || typeof migration !== 'object') return null;
    const item = migration as Record<string, unknown>;
    if (
      typeof item.name !== 'string' ||
      typeof item.sha256 !== 'string' ||
      !SHA256_PATTERN.test(item.sha256)
    ) {
      return null;
    }
    migrations.push({ name: item.name, sha256: item.sha256.toLowerCase() });
  }

  return {
    version: candidate.version,
    commit: candidate.commit,
    builtAt: candidate.builtAt,
    schemaSha256: candidate.schemaSha256.toLowerCase(),
    ...(typeof candidate.migrationPolicySha256 === 'string'
      ? { migrationPolicySha256: candidate.migrationPolicySha256.toLowerCase() }
      : {}),
    migrations: migrations.sort((a, b) => a.name.localeCompare(b.name))
  };
}

export function getReleaseManifestStatus(): ReleaseManifestStatus {
  const manifestPath = process.env.RELEASE_MANIFEST_PATH?.trim();
  if (!manifestPath) {
    // Production readiness must be tied to the exact manifest produced for the
    // running artifact. Development can still validate source migrations without
    // a generated manifest, but production must fail closed when it is absent.
    return {
      manifest: null,
      expectedMigrationFingerprint: null,
      valid: process.env.NODE_ENV !== 'production'
    };
  }

  let manifest: ReleaseManifest | null = null;
  try {
    manifest = parseManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
  } catch {
    return { manifest: null, expectedMigrationFingerprint: null, valid: false };
  }
  if (!manifest || manifest.migrations.length === 0) {
    return { manifest, expectedMigrationFingerprint: null, valid: false };
  }

  const schemaPath = process.env.SCHEMA_PATH?.trim();
  const migrationsPath = process.env.MIGRATIONS_PATH?.trim();
  const expectedMigrationFingerprint = fingerprintMigrationEntries(manifest.migrations);
  if (!schemaPath || !migrationsPath || !existsSync(schemaPath)) {
    return { manifest, expectedMigrationFingerprint, valid: false };
  }

  try {
    const currentMigrations = readMigrationEntries(migrationsPath);
    const schemaMatches = hashFile(schemaPath) === manifest.schemaSha256;
    const migrationsMatch =
      JSON.stringify(currentMigrations) === JSON.stringify(manifest.migrations);
    const policyPath = path.join(migrationsPath, MIGRATION_POLICY_FILENAME);
    const hasPolicy = existsSync(policyPath);
    const policyHashMatches = hasPolicy
      ? manifest.migrationPolicySha256 != null &&
        hashFile(policyPath) === manifest.migrationPolicySha256
      : manifest.migrationPolicySha256 == null;
    const policyValid =
      currentMigrations != null && readMigrationPolicy(migrationsPath, currentMigrations).valid;
    return {
      manifest,
      expectedMigrationFingerprint,
      valid: schemaMatches && migrationsMatch && policyHashMatches && policyValid
    };
  } catch {
    // A broken packaged resource must make readiness fail closed, not turn
    // `/ready` into an unexpected 500 response.
    return { manifest, expectedMigrationFingerprint, valid: false };
  }
}
