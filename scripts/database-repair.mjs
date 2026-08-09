#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMigrationHistoryEvidence } from './migration-history-report.mjs';
import { resolveDatabaseUrl } from './migration-history.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MIGRATIONS = resolve(ROOT, 'prisma', 'migrations');
const DEFAULT_SCHEMA = resolve(ROOT, 'prisma', 'schema.prisma');

export function decideDatabaseRepair(comparison, schemaDiff) {
  const base = { checksumRewriteAllowed: false };
  const acceptedCompatibility = comparison.acceptedCompatibility ?? [];
  if (comparison.ok && schemaDiff.matches) {
    return acceptedCompatibility.length > 0
      ? {
          ...base,
          action: 'verified_legacy_baseline',
          reason: 'schema_matches_and_all_noncanonical_checksums_are_explicitly_verified'
        }
      : { ...base, action: 'no_action', reason: 'schema_and_migration_history_match' };
  }

  const unsafeHistory =
    comparison.extra.length > 0 ||
    comparison.checksumMismatch.length > 0 ||
    comparison.unfinished.length > 0 ||
    comparison.rolledBack.length > 0;
  if (!unsafeHistory && comparison.missing.length > 0 && !schemaDiff.matches) {
    return {
      ...base,
      action: 'isolated_upgrade_required',
      reason: 'known_forward_migrations_are_missing'
    };
  }
  return {
    ...base,
    action: 'rebuild_import_required',
    reason: schemaDiff.matches
      ? 'history_is_not_cryptographically_or_structurally_trusted'
      : 'schema_state_does_not_match_the_claimed_migration_history'
  };
}

export function inspectSchemaDiff({ databaseUrl, schemaPath = DEFAULT_SCHEMA, root = ROOT }) {
  const prismaCli = resolve(root, 'node_modules', 'prisma', 'build', 'index.js');
  const result = spawnSync(
    process.execPath,
    [
      prismaCli,
      'migrate',
      'diff',
      '--from-url',
      databaseUrl,
      '--to-schema-datamodel',
      schemaPath,
      '--script',
      '--exit-code'
    ],
    { cwd: root, encoding: 'utf8', windowsHide: true }
  );
  if (result.status !== 0 && result.status !== 2) {
    throw new Error(
      `schema diff 诊断失败: ${(
        result.error?.message ||
        result.stderr ||
        result.stdout ||
        'unknown error'
      ).trim()}`
    );
  }
  return {
    matches: result.status === 0,
    exitCode: result.status,
    sql: result.status === 2 ? result.stdout.trim() : '',
    warnings: result.stderr.trim()
  };
}

export async function createDatabaseRepairDiagnosis({
  databaseUrl,
  migrationsDirectory = DEFAULT_MIGRATIONS,
  schemaPath = DEFAULT_SCHEMA,
  root = ROOT,
  generatedAt = new Date().toISOString()
} = {}) {
  const resolvedDatabaseUrl = resolveDatabaseUrl(databaseUrl, root);
  const history = await createMigrationHistoryEvidence({
    databaseUrl: resolvedDatabaseUrl,
    migrationsDirectory,
    root,
    generatedAt
  });
  const schemaDiff = inspectSchemaDiff({ databaseUrl: resolvedDatabaseUrl, schemaPath, root });
  const decision = decideDatabaseRepair(history.comparison, schemaDiff);

  return {
    schemaVersion: 1,
    generatedAt,
    readOnly: true,
    repairApplied: false,
    history,
    schemaDiff,
    decision
  };
}

async function main() {
  const diagnosis = await createDatabaseRepairDiagnosis({ databaseUrl: process.env.DATABASE_URL });
  console.log(JSON.stringify(diagnosis, null, 2));
  process.exitCode = ['no_action', 'verified_legacy_baseline'].includes(diagnosis.decision.action)
    ? 0
    : 1;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
