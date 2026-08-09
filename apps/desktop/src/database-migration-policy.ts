import fs from 'node:fs';
import path from 'node:path';
import type { SqliteClient } from './database-transfer';

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

type CanonicalMigration = { name: string; sha256: string };
type SourceEquivalence = {
  id: string;
  migrationName: string;
  recordedSha256: string;
  canonicalSha256: string;
  reason: string;
};
type RequiredTable = {
  name: string;
  columns: string[];
  indexes: Array<{ name: string; unique: boolean }>;
};
export type LegacyMigrationBaseline = {
  id: string;
  migrationName: string;
  recordedChecksum: string;
  canonicalSha256: string;
  requiredTables: RequiredTable[];
};
export type MigrationPolicy = {
  schemaVersion: 1;
  canonicalMigrations: CanonicalMigration[];
  sourceEquivalences: SourceEquivalence[];
  legacyBaselines: LegacyMigrationBaseline[];
};

export function normalizeMigrationChecksum(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (SHA256_HEX.test(raw)) return raw.toLowerCase();
  try {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === 32 && decoded.toString('base64') === raw) {
      return decoded.toString('hex');
    }
  } catch {
    // Non-digest markers require an explicit verified baseline below.
  }
  return raw.toLowerCase();
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`迁移策略字段无效: ${field}`);
  }
}

function parseRequiredTable(value: unknown): RequiredTable {
  if (!value || typeof value !== 'object') throw new Error('迁移策略 requiredTables 无效');
  const candidate = value as Record<string, unknown>;
  assertString(candidate.name, 'requiredTables.name');
  if (!SAFE_IDENTIFIER.test(candidate.name)) throw new Error('迁移策略表名无效');
  if (
    !Array.isArray(candidate.columns) ||
    !candidate.columns.every((column) => typeof column === 'string' && SAFE_IDENTIFIER.test(column))
  ) {
    throw new Error('迁移策略 columns 无效');
  }
  if (!Array.isArray(candidate.indexes)) throw new Error('迁移策略 indexes 无效');
  const indexes = candidate.indexes.map((index) => {
    if (!index || typeof index !== 'object') throw new Error('迁移策略 index 无效');
    const item = index as Record<string, unknown>;
    assertString(item.name, 'indexes.name');
    if (!SAFE_IDENTIFIER.test(item.name) || typeof item.unique !== 'boolean') {
      throw new Error('迁移策略 index 无效');
    }
    return { name: item.name, unique: item.unique };
  });
  return { name: candidate.name, columns: [...candidate.columns], indexes };
}

export function readMigrationPolicy(
  migrationsPath: string,
  entries: Array<{ name: string; checksum: string }>
): MigrationPolicy | null {
  const policyPath = path.join(migrationsPath, 'migration-policy.json');
  if (!fs.existsSync(policyPath)) return null;
  const candidate = JSON.parse(fs.readFileSync(policyPath, 'utf8')) as Record<string, unknown>;
  if (candidate.schemaVersion !== 1) throw new Error('迁移策略 schemaVersion 无效');
  if (!Array.isArray(candidate.canonicalMigrations)) {
    throw new Error('迁移策略 canonicalMigrations 无效');
  }
  const canonicalMigrations = candidate.canonicalMigrations.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('迁移策略 migration 无效');
    const item = entry as Record<string, unknown>;
    assertString(item.name, 'canonicalMigrations.name');
    assertString(item.sha256, 'canonicalMigrations.sha256');
    if (!SHA256_HEX.test(item.sha256)) throw new Error('迁移策略 sha256 无效');
    return { name: item.name, sha256: item.sha256.toLowerCase() };
  });
  const actual = entries.map((entry) => ({ name: entry.name, sha256: entry.checksum }));
  if (JSON.stringify(canonicalMigrations) !== JSON.stringify(actual)) {
    throw new Error('迁移策略与安装包 migration.sql 不一致');
  }

  if (!Array.isArray(candidate.sourceEquivalences)) {
    throw new Error('迁移策略 sourceEquivalences 无效');
  }
  const sourceEquivalences = candidate.sourceEquivalences.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('迁移源码等价规则无效');
    const item = entry as Record<string, unknown>;
    const { id, migrationName, recordedSha256, canonicalSha256, reason } = item;
    assertString(id, 'sourceEquivalences.id');
    assertString(migrationName, 'sourceEquivalences.migrationName');
    assertString(recordedSha256, 'sourceEquivalences.recordedSha256');
    assertString(canonicalSha256, 'sourceEquivalences.canonicalSha256');
    assertString(reason, 'sourceEquivalences.reason');
    if (!SHA256_HEX.test(recordedSha256) || !SHA256_HEX.test(canonicalSha256)) {
      throw new Error('迁移源码等价 checksum 无效');
    }
    return {
      id,
      migrationName,
      recordedSha256: recordedSha256.toLowerCase(),
      canonicalSha256: canonicalSha256.toLowerCase(),
      reason
    };
  });

  if (!Array.isArray(candidate.legacyBaselines)) {
    throw new Error('迁移策略 legacyBaselines 无效');
  }
  const legacyBaselines = candidate.legacyBaselines.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('迁移兼容基线无效');
    const item = entry as Record<string, unknown>;
    const { id, migrationName, recordedChecksum, canonicalSha256, requiredTables } = item;
    assertString(id, 'legacyBaselines.id');
    assertString(migrationName, 'legacyBaselines.migrationName');
    assertString(recordedChecksum, 'legacyBaselines.recordedChecksum');
    assertString(canonicalSha256, 'legacyBaselines.canonicalSha256');
    if (!SHA256_HEX.test(canonicalSha256) || !Array.isArray(requiredTables)) {
      throw new Error('迁移兼容基线 checksum 或 requiredTables 无效');
    }
    return {
      id,
      migrationName,
      recordedChecksum: normalizeMigrationChecksum(recordedChecksum),
      canonicalSha256: canonicalSha256.toLowerCase(),
      requiredTables: requiredTables.map(parseRequiredTable)
    };
  });
  return { schemaVersion: 1, canonicalMigrations, sourceEquivalences, legacyBaselines };
}

export function findSourceEquivalence(
  policy: MigrationPolicy | null,
  migrationName: string,
  actual: string,
  canonical: string
): SourceEquivalence | null {
  return (
    policy?.sourceEquivalences.find(
      (entry) =>
        entry.migrationName === migrationName &&
        entry.recordedSha256 === actual &&
        entry.canonicalSha256 === canonical
    ) ?? null
  );
}

export function findLegacyBaseline(
  policy: MigrationPolicy | null,
  migrationName: string,
  actual: string,
  canonical: string
): LegacyMigrationBaseline | null {
  return (
    policy?.legacyBaselines.find(
      (entry) =>
        entry.migrationName === migrationName &&
        entry.recordedChecksum === actual &&
        entry.canonicalSha256 === canonical
    ) ?? null
  );
}

export async function verifyLegacyBaselineSchema(
  client: Pick<SqliteClient, 'execute'>,
  baseline: LegacyMigrationBaseline
): Promise<void> {
  for (const table of baseline.requiredTables) {
    const columns = new Set(
      ((await client.execute(`PRAGMA table_info("${table.name}")`)).rows ?? []).map((row) =>
        String(row.name)
      )
    );
    for (const column of table.columns) {
      if (!columns.has(column)) throw new Error(`兼容基线缺少字段 ${table.name}.${column}`);
    }
    const indexes = new Map(
      ((await client.execute(`PRAGMA index_list("${table.name}")`)).rows ?? []).map((row) => [
        String(row.name),
        Number(row.unique ?? 0) === 1
      ])
    );
    for (const index of table.indexes) {
      if (!indexes.has(index.name)) throw new Error(`兼容基线缺少索引 ${index.name}`);
      if (indexes.get(index.name) !== index.unique) {
        throw new Error(`兼容基线索引唯一性不一致 ${index.name}`);
      }
    }
  }
}
