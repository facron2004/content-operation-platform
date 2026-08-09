import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePublicDir } from '../bootstrap-static';
import {
  fingerprintMigrationEntries,
  getReleaseManifestStatus,
  readMigrationEntries,
  resolveReleaseVersion
} from './release-manifest';
import {
  canonicalizeAppliedMigrations,
  readMigrationPolicy,
  type AppliedMigrationRow
} from './migration-policy';

export type ReadinessResponse = {
  status: 'ready' | 'not_ready';
  bootId: string;
  appVersion: string;
  migrationFingerprint: string;
  checks: {
    database: 'ok' | 'failed';
    migrations: 'ok' | 'mismatch';
    web: 'ok' | 'missing';
  };
};

const fallbackBootId = randomUUID();

function getMigrationDirectory(): string | null {
  const configured = process.env.MIGRATIONS_PATH?.trim();
  if (configured) return configured;

  const candidate = resolve(__dirname, '../../../..', 'prisma', 'migrations');
  return existsSync(candidate) ? candidate : null;
}

function getExpectedMigrationFingerprint(): string | null {
  const configured = process.env.MIGRATION_FINGERPRINT?.trim();
  if (configured) return configured;

  const migrationsDirectory = getMigrationDirectory();
  if (!migrationsDirectory) return null;
  const entries = readMigrationEntries(migrationsDirectory);
  return entries && entries.length > 0 ? fingerprintMigrationEntries(entries) : null;
}

@Injectable()
export class ReadinessService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: Pick<PrismaService, '$queryRawUnsafe'>
  ) {}

  async check(): Promise<ReadinessResponse> {
    const release = getReleaseManifestStatus();
    const configuredBootId = process.env.BOOT_ID?.trim();
    const bootId = configuredBootId || fallbackBootId;
    // A packaged/production process must be tied to the desktop launch that
    // supervises it. Development and test runners keep the deterministic
    // fallback so the API can still be checked without Electron.
    const bootIdentityReady = process.env.NODE_ENV !== 'production' || Boolean(configuredBootId);
    const appVersion = resolveReleaseVersion(release);
    const web = existsSync(join(resolvePublicDir(), 'index.html')) ? 'ok' : 'missing';

    let database: 'ok' | 'failed' = 'failed';
    let migrations: 'ok' | 'mismatch' = 'mismatch';
    let migrationFingerprint = 'unavailable';

    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      database = 'ok';
    } catch {
      return {
        status: 'not_ready',
        bootId,
        appVersion,
        migrationFingerprint,
        checks: { database, migrations, web }
      };
    }

    try {
      const rows = (await this.prisma.$queryRawUnsafe(
        `SELECT migration_name, checksum, finished_at, rolled_back_at
         FROM "_prisma_migrations"
         ORDER BY migration_name`
      )) as AppliedMigrationRow[];
      const migrationsDirectory = getMigrationDirectory();
      const sourceEntries = migrationsDirectory
        ? (readMigrationEntries(migrationsDirectory) ?? [])
        : [];
      const expectedEntries = release.manifest?.migrations ?? sourceEntries;
      const policyResult = migrationsDirectory
        ? readMigrationPolicy(migrationsDirectory, sourceEntries)
        : { policy: null, valid: true };
      const canonical = await canonicalizeAppliedMigrations(
        (sql) => this.prisma.$queryRawUnsafe(sql),
        rows,
        expectedEntries,
        policyResult.policy
      );
      migrationFingerprint =
        canonical.entries.length > 0
          ? fingerprintMigrationEntries(canonical.entries)
          : 'unavailable';
      const expected = release.expectedMigrationFingerprint ?? getExpectedMigrationFingerprint();
      migrations =
        rows.length > 0 &&
        canonical.valid &&
        policyResult.valid &&
        release.valid &&
        expected != null &&
        expected === migrationFingerprint
          ? 'ok'
          : 'mismatch';
    } catch {
      migrations = 'mismatch';
    }

    const ready = bootIdentityReady && database === 'ok' && migrations === 'ok' && web === 'ok';
    return {
      status: ready ? 'ready' : 'not_ready',
      bootId,
      appVersion,
      migrationFingerprint,
      checks: { database, migrations, web }
    };
  }
}
