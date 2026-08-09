import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function normalizeMigrationChecksum(value) {
  const raw = String(value ?? '').trim();
  if (SHA256_HEX.test(raw)) return raw.toLowerCase();

  try {
    const decoded = Buffer.from(raw, 'base64');
    const normalizedBase64 = decoded.toString('base64');
    if (decoded.length === 32 && normalizedBase64 === raw) return decoded.toString('hex');
  } catch {
    // Non-digest historical markers are handled only by an explicit baseline.
  }
  return raw.toLowerCase();
}

function readCanonicalMigrationEntries(migrationsDirectory) {
  return readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const migrationFile = path.join(migrationsDirectory, entry.name, 'migration.sql');
      return {
        name: entry.name,
        sha256: existsSync(migrationFile) ? sha256File(migrationFile) : ''
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function isCanonicalMigration(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.name === 'string' &&
    typeof value.sha256 === 'string' &&
    SHA256_HEX.test(value.sha256)
  );
}

function isRequiredTable(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.name === 'string' &&
    SAFE_IDENTIFIER.test(value.name) &&
    Array.isArray(value.columns) &&
    value.columns.every((column) => typeof column === 'string' && SAFE_IDENTIFIER.test(column)) &&
    Array.isArray(value.indexes) &&
    value.indexes.every(
      (index) =>
        index &&
        typeof index === 'object' &&
        typeof index.name === 'string' &&
        SAFE_IDENTIFIER.test(index.name) &&
        typeof index.unique === 'boolean'
    )
  );
}

function isLegacyBaseline(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.migrationName === 'string' &&
    typeof value.recordedChecksum === 'string' &&
    typeof value.canonicalSha256 === 'string' &&
    SHA256_HEX.test(value.canonicalSha256) &&
    Array.isArray(value.requiredTables) &&
    value.requiredTables.every(isRequiredTable)
  );
}

function isSourceEquivalence(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.migrationName === 'string' &&
    typeof value.recordedSha256 === 'string' &&
    SHA256_HEX.test(value.recordedSha256) &&
    typeof value.canonicalSha256 === 'string' &&
    SHA256_HEX.test(value.canonicalSha256) &&
    typeof value.reason === 'string' &&
    value.reason.length > 0
  );
}

export function readMigrationPolicy(migrationsDirectory) {
  const policyPath = path.join(migrationsDirectory, 'migration-policy.json');
  if (!existsSync(policyPath)) return { policy: null, errors: [] };

  const errors = [];
  let candidate;
  try {
    candidate = JSON.parse(readFileSync(policyPath, 'utf8'));
  } catch (error) {
    return {
      policy: null,
      errors: [`迁移策略文件无效: ${error instanceof Error ? error.message : String(error)}`]
    };
  }

  if (
    !candidate ||
    typeof candidate !== 'object' ||
    candidate.schemaVersion !== 1 ||
    !Array.isArray(candidate.canonicalMigrations) ||
    !candidate.canonicalMigrations.every(isCanonicalMigration) ||
    !Array.isArray(candidate.sourceEquivalences) ||
    !candidate.sourceEquivalences.every(isSourceEquivalence) ||
    !Array.isArray(candidate.legacyBaselines) ||
    !candidate.legacyBaselines.every(isLegacyBaseline)
  ) {
    return { policy: null, errors: ['迁移策略文件结构无效'] };
  }

  const policy = {
    schemaVersion: 1,
    canonicalMigrations: candidate.canonicalMigrations
      .map((entry) => ({ name: entry.name, sha256: entry.sha256.toLowerCase() }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    sourceEquivalences: candidate.sourceEquivalences.map((entry) => ({
      ...entry,
      recordedSha256: entry.recordedSha256.toLowerCase(),
      canonicalSha256: entry.canonicalSha256.toLowerCase()
    })),
    legacyBaselines: candidate.legacyBaselines.map((baseline) => ({
      ...baseline,
      recordedChecksum: normalizeMigrationChecksum(baseline.recordedChecksum),
      canonicalSha256: baseline.canonicalSha256.toLowerCase()
    }))
  };
  const actual = readCanonicalMigrationEntries(migrationsDirectory);
  if (JSON.stringify(actual) !== JSON.stringify(policy.canonicalMigrations)) {
    errors.push('迁移策略中的 canonicalMigrations 与当前 migration.sql 不一致');
  }
  for (const equivalence of policy.sourceEquivalences) {
    const canonical = policy.canonicalMigrations.find(
      (entry) => entry.name === equivalence.migrationName
    );
    if (!canonical || canonical.sha256 !== equivalence.canonicalSha256) {
      errors.push(`迁移源码等价规则 ${equivalence.id} 未指向当前 canonical checksum`);
    }
  }
  for (const baseline of policy.legacyBaselines) {
    const canonical = policy.canonicalMigrations.find(
      (entry) => entry.name === baseline.migrationName
    );
    if (!canonical || canonical.sha256 !== baseline.canonicalSha256) {
      errors.push(`迁移兼容基线 ${baseline.id} 未指向当前 canonical checksum`);
    }
  }

  return { policy, errors };
}

export function findSourceEquivalence(policy, migrationName, recordedChecksum, canonicalSha256) {
  if (!policy) return null;
  const normalizedRecorded = normalizeMigrationChecksum(recordedChecksum);
  const normalizedCanonical = normalizeMigrationChecksum(canonicalSha256);
  return (
    policy.sourceEquivalences.find(
      (entry) =>
        entry.migrationName === migrationName &&
        entry.recordedSha256 === normalizedRecorded &&
        entry.canonicalSha256 === normalizedCanonical
    ) ?? null
  );
}

export function findLegacyBaseline(policy, migrationName, recordedChecksum, canonicalSha256) {
  if (!policy) return null;
  const normalizedRecorded = normalizeMigrationChecksum(recordedChecksum);
  return (
    policy.legacyBaselines.find(
      (baseline) =>
        baseline.migrationName === migrationName &&
        baseline.recordedChecksum === normalizedRecorded &&
        baseline.canonicalSha256 === normalizeMigrationChecksum(canonicalSha256)
    ) ?? null
  );
}

export async function verifyLegacyBaselineSchema(client, baseline) {
  const errors = [];
  for (const table of baseline.requiredTables) {
    const columnsResult = await client.execute(`PRAGMA table_info("${table.name}")`);
    const columns = new Set((columnsResult.rows ?? []).map((row) => String(row.name)));
    for (const column of table.columns) {
      if (!columns.has(column)) errors.push(`缺少字段 ${table.name}.${column}`);
    }

    const indexesResult = await client.execute(`PRAGMA index_list("${table.name}")`);
    const indexes = new Map(
      (indexesResult.rows ?? []).map((row) => [String(row.name), Number(row.unique ?? 0) === 1])
    );
    for (const index of table.indexes) {
      if (!indexes.has(index.name)) {
        errors.push(`缺少索引 ${index.name}`);
      } else if (indexes.get(index.name) !== index.unique) {
        errors.push(`索引唯一性不一致 ${index.name}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
