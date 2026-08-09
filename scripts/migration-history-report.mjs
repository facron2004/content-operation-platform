#!/usr/bin/env node
/**
 * Read-only DB-002 migration evidence report.
 *
 * The report is intentionally diagnostic: it never updates `_prisma_migrations`,
 * creates a missing database, or attempts a repair. A mismatch exits non-zero so
 * it can remain a release/readiness gate while still emitting machine-readable
 * evidence for the eventual backed-up repair decision.
 */
import { existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkMigrationHistory,
  readMigrationEntries,
  resolveDatabaseUrl,
  resolveLocalDatabasePath
} from './migration-history.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MIGRATIONS = resolve(ROOT, 'prisma/migrations');

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}

function fileState(filePath) {
  const normalized = normalizePath(filePath);
  if (!existsSync(filePath)) return { path: normalized, exists: false, sizeBytes: 0 };

  try {
    return { path: normalized, exists: true, sizeBytes: statSync(filePath).size };
  } catch (error) {
    return {
      path: normalized,
      exists: true,
      sizeBytes: null,
      statError: error instanceof Error ? error.message : String(error)
    };
  }
}

function emptyHistory(source) {
  return {
    ok: false,
    sourceCount: source.entries.length,
    appliedCount: 0,
    missing: source.entries.map((entry) => entry.name),
    extra: [],
    checksumMismatch: [],
    unfinished: [],
    rolledBack: [],
    duplicateSource: [],
    duplicateApplied: [],
    sourceErrors: source.errors,
    sourceEntries: source.entries,
    appliedRows: [],
    databaseError: '数据库文件不存在，未执行数据库查询'
  };
}

export async function createMigrationHistoryEvidence({
  databaseUrl,
  migrationsDirectory = DEFAULT_MIGRATIONS,
  root = ROOT,
  generatedAt = new Date().toISOString()
} = {}) {
  const resolvedDatabaseUrl = resolveDatabaseUrl(databaseUrl, root);
  const localPath = resolveLocalDatabasePath(resolvedDatabaseUrl, root);
  if (!localPath) {
    throw new Error('迁移历史证据报告仅支持本地 file: SQLite URL，拒绝连接远程数据库');
  }

  const source = readMigrationEntries(migrationsDirectory);
  const databasePath = normalizePath(localPath);
  const database = {
    kind: 'sqlite',
    url: `file:${databasePath}`,
    file: fileState(localPath),
    wal: fileState(`${localPath}-wal`),
    shm: fileState(`${localPath}-shm`)
  };
  const history = existsSync(localPath)
    ? await checkMigrationHistory(resolvedDatabaseUrl, migrationsDirectory, root)
    : emptyHistory(source);

  const {
    sourceEntries = source.entries,
    appliedRows = [],
    migrationPolicy = null,
    ...comparison
  } = history;
  const historyNeedsDispositionEvidence = !comparison.ok;
  const hasAcceptedCompatibility = (comparison.acceptedCompatibility ?? []).length > 0;

  return {
    schemaVersion: 1,
    generatedAt,
    readOnly: true,
    database,
    source: {
      migrationsDirectory: normalizePath(migrationsDirectory),
      entries: sourceEntries,
      errors: history.sourceErrors ?? source.errors,
      policy: migrationPolicy
        ? {
            schemaVersion: migrationPolicy.schemaVersion,
            canonicalMigrationCount: migrationPolicy.canonicalMigrations.length,
            sourceEquivalenceCount: migrationPolicy.sourceEquivalences.length,
            legacyBaselineCount: migrationPolicy.legacyBaselines.length
          }
        : null
    },
    applied: {
      count: appliedRows.length,
      rows: appliedRows
    },
    comparison,
    disposition: {
      repairApplied: false,
      backupRequired: historyNeedsDispositionEvidence,
      sourceReviewRequired: historyNeedsDispositionEvidence,
      cleanWindowsEvidenceRequired: historyNeedsDispositionEvidence,
      recommendation: comparison.ok
        ? hasAcceptedCompatibility
          ? 'verified_compatibility_no_checksum_rewrite'
          : 'no_repair_needed'
        : 'backup_source_and_clean_windows_evidence_required'
    }
  };
}

async function main() {
  const evidence = await createMigrationHistoryEvidence({
    databaseUrl: process.env.DATABASE_URL,
    migrationsDirectory: DEFAULT_MIGRATIONS,
    root: ROOT
  });
  console.log(JSON.stringify(evidence, null, 2));
  process.exitCode = evidence.comparison.ok ? 0 : 1;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
