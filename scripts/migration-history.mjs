import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import {
  findLegacyBaseline,
  findSourceEquivalence,
  normalizeMigrationChecksum,
  readMigrationPolicy,
  verifyLegacyBaselineSchema
} from './migration-policy.mjs';

function migrationChecksum(sql) {
  return createHash('sha256').update(sql).digest('hex');
}

/**
 * Resolve a file: DATABASE_URL relative to the project root used by the
 * command. Remote libsql URLs are returned unchanged.
 */
export function resolveDatabaseUrl(input, root = process.cwd()) {
  const raw = input ?? process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
  if (!raw.startsWith('file:')) return raw;

  let file = raw.slice('file:'.length);
  file = file.replace(/^\/{2,}([A-Za-z]:[\\/])/, '$1');
  const absolute = path.isAbsolute(file) ? file : path.resolve(root, file);
  return `file:${absolute.replace(/\\/g, '/')}`;
}

export function resolveLocalDatabasePath(input, root = process.cwd()) {
  const url = resolveDatabaseUrl(input, root);
  if (!url.startsWith('file:')) return null;
  return url.slice('file:'.length);
}

/**
 * Read the migration source set without touching any database.
 */
export function readMigrationEntries(migrationsDirectory) {
  if (!existsSync(migrationsDirectory)) {
    return {
      entries: [],
      errors: [`迁移目录不存在: ${migrationsDirectory}`]
    };
  }

  const entries = [];
  const errors = [];
  const directories = readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const name of directories) {
    const migrationPath = path.join(migrationsDirectory, name, 'migration.sql');
    if (!existsSync(migrationPath)) {
      errors.push(`迁移缺少 migration.sql: ${name}`);
      continue;
    }

    const sql = readFileSync(migrationPath, 'utf8');
    entries.push({ name, checksum: migrationChecksum(sql) });
  }

  return { entries, errors };
}

function addUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

export function normalizeMigrationRows(rows) {
  return rows.map((row) => {
    const recordedChecksum = String(row.checksum ?? '');
    return {
      migration_name: String(row.migration_name ?? ''),
      recorded_checksum: recordedChecksum,
      checksum: normalizeMigrationChecksum(recordedChecksum),
      finished_at: row.finished_at ?? null,
      rolled_back_at: row.rolled_back_at ?? null
    };
  });
}

/**
 * Compare a source migration set with rows read from _prisma_migrations.
 * This function is pure so the comparison contract can be tested without a
 * real database or any write operation.
 */
export function compareMigrationHistory(
  sourceEntries,
  appliedRows,
  { policy = null, verifiedLegacyBaselineIds = new Set() } = {}
) {
  const sourceByName = new Map();
  const duplicateSource = [];
  for (const entry of sourceEntries) {
    if (sourceByName.has(entry.name)) addUnique(duplicateSource, entry.name);
    sourceByName.set(entry.name, entry);
  }

  const appliedByName = new Map();
  for (const row of appliedRows) {
    const name = String(row.migration_name ?? '');
    const rows = appliedByName.get(name) ?? [];
    const recordedChecksum = String(row.recorded_checksum ?? row.checksum ?? '');
    rows.push({
      name,
      checksum: normalizeMigrationChecksum(recordedChecksum),
      recordedChecksum,
      finishedAt: row.finished_at,
      rolledBackAt: row.rolled_back_at
    });
    appliedByName.set(name, rows);
  }

  const missing = [];
  const checksumMismatch = [];
  const acceptedCompatibility = [];
  const unfinished = [];
  const rolledBack = [];
  const duplicateApplied = [];

  for (const entry of sourceEntries) {
    const rows = appliedByName.get(entry.name) ?? [];
    if (rows.length === 0) {
      missing.push(entry.name);
      continue;
    }
    if (rows.length > 1) addUnique(duplicateApplied, entry.name);

    for (const row of rows) {
      if (row.finishedAt == null) addUnique(unfinished, entry.name);
      if (row.rolledBackAt != null) addUnique(rolledBack, entry.name);
      const actualChecksum = normalizeMigrationChecksum(row.checksum);
      const expectedChecksum = normalizeMigrationChecksum(entry.checksum);
      const sourceEquivalence = findSourceEquivalence(
        policy,
        entry.name,
        actualChecksum,
        expectedChecksum
      );
      const legacyBaseline = findLegacyBaseline(
        policy,
        entry.name,
        actualChecksum,
        expectedChecksum
      );
      const acceptedBaseline =
        legacyBaseline && verifiedLegacyBaselineIds.has(legacyBaseline.id) ? legacyBaseline : null;
      if (sourceEquivalence || acceptedBaseline) {
        acceptedCompatibility.push({
          name: entry.name,
          actual: row.recordedChecksum,
          canonical: expectedChecksum,
          policyId: (sourceEquivalence ?? acceptedBaseline).id,
          kind: sourceEquivalence ? 'source_equivalent' : 'verified_legacy_baseline'
        });
      } else if (actualChecksum !== expectedChecksum) {
        checksumMismatch.push({
          name: entry.name,
          expected: expectedChecksum,
          actual: row.recordedChecksum
        });
      } else if (row.recordedChecksum.toLowerCase() !== expectedChecksum) {
        acceptedCompatibility.push({
          name: entry.name,
          actual: row.recordedChecksum,
          canonical: expectedChecksum,
          policyId: 'sha256-encoding-normalization',
          kind: 'checksum_encoding_equivalent'
        });
      }
    }
  }

  const extra = [];
  for (const name of appliedByName.keys()) {
    if (!sourceByName.has(name)) extra.push(name);
  }

  return {
    ok:
      missing.length === 0 &&
      extra.length === 0 &&
      checksumMismatch.length === 0 &&
      unfinished.length === 0 &&
      rolledBack.length === 0 &&
      duplicateSource.length === 0 &&
      duplicateApplied.length === 0,
    sourceCount: sourceEntries.length,
    appliedCount: appliedRows.length,
    missing,
    extra,
    checksumMismatch,
    acceptedCompatibility,
    unfinished,
    rolledBack,
    duplicateSource,
    duplicateApplied
  };
}

export function formatMigrationHistoryReport(report) {
  const lines = [
    `迁移历史 checksum: ${report.ok ? '通过' : '失败'}`,
    `源码迁移数=${report.sourceCount}，数据库登记数=${report.appliedCount}`
  ];

  if (report.missing.length > 0) lines.push(`缺少登记: ${report.missing.join(', ')}`);
  if (report.extra.length > 0) lines.push(`多余登记: ${report.extra.join(', ')}`);
  if (report.unfinished.length > 0) lines.push(`未完成迁移: ${report.unfinished.join(', ')}`);
  if (report.rolledBack.length > 0) lines.push(`已回滚迁移: ${report.rolledBack.join(', ')}`);
  if (report.duplicateSource.length > 0) {
    lines.push(`源码重复迁移名: ${report.duplicateSource.join(', ')}`);
  }
  if (report.duplicateApplied.length > 0) {
    lines.push(`数据库重复迁移名: ${report.duplicateApplied.join(', ')}`);
  }
  for (const accepted of report.acceptedCompatibility ?? []) {
    lines.push(
      `兼容基线已验证: ${accepted.name}（policy=${accepted.policyId}, actual=${accepted.actual}, canonical=${accepted.canonical}）`
    );
  }
  for (const mismatch of report.checksumMismatch) {
    lines.push(
      `checksum 不一致: ${mismatch.name}（expected=${mismatch.expected}, actual=${mismatch.actual}）`
    );
  }

  return lines.join('\n');
}

export async function checkMigrationHistory(
  databaseUrl,
  migrationsDirectory,
  root = process.cwd()
) {
  const source = readMigrationEntries(migrationsDirectory);
  const policyResult = readMigrationPolicy(migrationsDirectory);
  const url = resolveDatabaseUrl(databaseUrl, root);
  const client = createClient({ url });

  try {
    const result = await client.execute(
      `SELECT migration_name, checksum, finished_at, rolled_back_at
       FROM "_prisma_migrations"
       ORDER BY migration_name`
    );
    const appliedRows = normalizeMigrationRows(result.rows);
    const verifiedLegacyBaselineIds = new Set();
    const baselineErrors = [];
    for (const sourceEntry of source.entries) {
      for (const row of appliedRows.filter(
        (candidate) => candidate.migration_name === sourceEntry.name
      )) {
        const baseline = findLegacyBaseline(
          policyResult.policy,
          sourceEntry.name,
          row.checksum,
          sourceEntry.checksum
        );
        if (!baseline) continue;
        const verification = await verifyLegacyBaselineSchema(client, baseline);
        if (verification.ok) verifiedLegacyBaselineIds.add(baseline.id);
        else baselineErrors.push(...verification.errors.map((error) => `${baseline.id}: ${error}`));
      }
    }
    const report = compareMigrationHistory(source.entries, appliedRows, {
      policy: policyResult.policy,
      verifiedLegacyBaselineIds
    });
    return {
      ...report,
      ok:
        report.ok &&
        source.errors.length === 0 &&
        policyResult.errors.length === 0 &&
        baselineErrors.length === 0,
      sourceErrors: source.errors,
      policyErrors: policyResult.errors,
      baselineErrors,
      migrationPolicy: policyResult.policy,
      sourceEntries: source.entries,
      appliedRows
    };
  } catch (error) {
    return {
      ok: false,
      sourceCount: source.entries.length,
      appliedCount: 0,
      missing: [],
      extra: [],
      checksumMismatch: [],
      acceptedCompatibility: [],
      unfinished: [],
      rolledBack: [],
      duplicateSource: [],
      duplicateApplied: [],
      sourceErrors: source.errors,
      policyErrors: policyResult.errors,
      baselineErrors: [],
      migrationPolicy: policyResult.policy,
      sourceEntries: source.entries,
      appliedRows: [],
      databaseError: error instanceof Error ? error.message : String(error)
    };
  } finally {
    client.close();
  }
}
