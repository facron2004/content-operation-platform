import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const MIGRATION_POLICY_FILENAME = 'migration-policy.json';

export type CanonicalMigration = { name: string; sha256: string };
type SourceEquivalence = {
  id: string;
  migrationName: string;
  recordedSha256: string;
  canonicalSha256: string;
};
type RequiredTable = {
  name: string;
  columns: string[];
  indexes: Array<{ name: string; unique: boolean }>;
};
type LegacyBaseline = {
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
  legacyBaselines: LegacyBaseline[];
};

export type AppliedMigrationRow = {
  migration_name: string;
  checksum: string;
  finished_at: unknown;
  rolled_back_at: unknown;
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
    // Non-digest markers require a verified policy baseline.
  }
  return raw.toLowerCase();
}

function parseRequiredTables(value: unknown): RequiredTable[] | null {
  if (!Array.isArray(value)) return null;
  const result: RequiredTable[] = [];
  for (const table of value) {
    if (!table || typeof table !== 'object') return null;
    const candidate = table as Record<string, unknown>;
    if (
      typeof candidate.name !== 'string' ||
      !SAFE_IDENTIFIER.test(candidate.name) ||
      !Array.isArray(candidate.columns) ||
      !candidate.columns.every(
        (column) => typeof column === 'string' && SAFE_IDENTIFIER.test(column)
      ) ||
      !Array.isArray(candidate.indexes)
    ) {
      return null;
    }
    const indexes: RequiredTable['indexes'] = [];
    for (const index of candidate.indexes) {
      if (!index || typeof index !== 'object') return null;
      const item = index as Record<string, unknown>;
      if (
        typeof item.name !== 'string' ||
        !SAFE_IDENTIFIER.test(item.name) ||
        typeof item.unique !== 'boolean'
      ) {
        return null;
      }
      indexes.push({ name: item.name, unique: item.unique });
    }
    result.push({ name: candidate.name, columns: [...candidate.columns], indexes });
  }
  return result;
}

export function readMigrationPolicy(
  migrationsPath: string,
  canonicalMigrations: CanonicalMigration[]
): { policy: MigrationPolicy | null; valid: boolean } {
  const policyPath = path.join(migrationsPath, MIGRATION_POLICY_FILENAME);
  if (!existsSync(policyPath)) return { policy: null, valid: true };

  try {
    const candidate = JSON.parse(readFileSync(policyPath, 'utf8')) as Record<string, unknown>;
    if (
      candidate.schemaVersion !== 1 ||
      !Array.isArray(candidate.canonicalMigrations) ||
      !Array.isArray(candidate.sourceEquivalences) ||
      !Array.isArray(candidate.legacyBaselines)
    ) {
      return { policy: null, valid: false };
    }
    const pinned: CanonicalMigration[] = [];
    for (const migration of candidate.canonicalMigrations) {
      if (!migration || typeof migration !== 'object') return { policy: null, valid: false };
      const item = migration as Record<string, unknown>;
      if (
        typeof item.name !== 'string' ||
        typeof item.sha256 !== 'string' ||
        !SHA256_HEX.test(item.sha256)
      ) {
        return { policy: null, valid: false };
      }
      pinned.push({ name: item.name, sha256: item.sha256.toLowerCase() });
    }
    if (JSON.stringify(pinned) !== JSON.stringify(canonicalMigrations)) {
      return { policy: null, valid: false };
    }

    const sourceEquivalences: SourceEquivalence[] = [];
    for (const equivalence of candidate.sourceEquivalences) {
      if (!equivalence || typeof equivalence !== 'object') return { policy: null, valid: false };
      const item = equivalence as Record<string, unknown>;
      if (
        typeof item.id !== 'string' ||
        typeof item.migrationName !== 'string' ||
        typeof item.recordedSha256 !== 'string' ||
        !SHA256_HEX.test(item.recordedSha256) ||
        typeof item.canonicalSha256 !== 'string' ||
        !SHA256_HEX.test(item.canonicalSha256)
      ) {
        return { policy: null, valid: false };
      }
      sourceEquivalences.push({
        id: item.id,
        migrationName: item.migrationName,
        recordedSha256: item.recordedSha256.toLowerCase(),
        canonicalSha256: item.canonicalSha256.toLowerCase()
      });
    }

    const legacyBaselines: LegacyBaseline[] = [];
    for (const baseline of candidate.legacyBaselines) {
      if (!baseline || typeof baseline !== 'object') return { policy: null, valid: false };
      const item = baseline as Record<string, unknown>;
      const requiredTables = parseRequiredTables(item.requiredTables);
      if (
        typeof item.id !== 'string' ||
        typeof item.migrationName !== 'string' ||
        typeof item.recordedChecksum !== 'string' ||
        typeof item.canonicalSha256 !== 'string' ||
        !SHA256_HEX.test(item.canonicalSha256) ||
        !requiredTables
      ) {
        return { policy: null, valid: false };
      }
      legacyBaselines.push({
        id: item.id,
        migrationName: item.migrationName,
        recordedChecksum: normalizeMigrationChecksum(item.recordedChecksum),
        canonicalSha256: item.canonicalSha256.toLowerCase(),
        requiredTables
      });
    }
    return {
      policy: {
        schemaVersion: 1,
        canonicalMigrations: pinned,
        sourceEquivalences,
        legacyBaselines
      },
      valid: true
    };
  } catch {
    return { policy: null, valid: false };
  }
}

async function verifyLegacyBaseline(
  query: (sql: string) => Promise<unknown>,
  baseline: LegacyBaseline
): Promise<boolean> {
  for (const table of baseline.requiredTables) {
    const columnRows = (await query(`PRAGMA table_info("${table.name}")`)) as Array<
      Record<string, unknown>
    >;
    const columns = new Set(columnRows.map((row) => String(row.name)));
    if (table.columns.some((column) => !columns.has(column))) return false;

    const indexRows = (await query(`PRAGMA index_list("${table.name}")`)) as Array<
      Record<string, unknown>
    >;
    const indexes = new Map(
      indexRows.map((row) => [String(row.name), Number(row.unique ?? 0) === 1])
    );
    if (
      table.indexes.some(
        (index) => !indexes.has(index.name) || indexes.get(index.name) !== index.unique
      )
    ) {
      return false;
    }
  }
  return true;
}

export async function canonicalizeAppliedMigrations(
  query: (sql: string) => Promise<unknown>,
  rows: AppliedMigrationRow[],
  expected: CanonicalMigration[],
  policy: MigrationPolicy | null
): Promise<{ entries: CanonicalMigration[]; valid: boolean }> {
  const expectedByName = new Map(expected.map((entry) => [entry.name, entry]));
  const seen = new Set<string>();
  const entries: CanonicalMigration[] = [];

  for (const row of rows) {
    if (seen.has(row.migration_name)) return { entries: [], valid: false };
    seen.add(row.migration_name);
    if (row.finished_at == null || row.rolled_back_at != null) return { entries: [], valid: false };
    const canonical = expectedByName.get(row.migration_name);
    if (!canonical) return { entries: [], valid: false };
    const actual = normalizeMigrationChecksum(row.checksum);
    if (actual !== canonical.sha256) {
      const equivalent = policy?.sourceEquivalences.some(
        (item) =>
          item.migrationName === row.migration_name &&
          item.recordedSha256 === actual &&
          item.canonicalSha256 === canonical.sha256
      );
      if (!equivalent) {
        const baseline = policy?.legacyBaselines.find(
          (item) =>
            item.migrationName === row.migration_name &&
            item.recordedChecksum === actual &&
            item.canonicalSha256 === canonical.sha256
        );
        if (!baseline || !(await verifyLegacyBaseline(query, baseline))) {
          return { entries: [], valid: false };
        }
      }
    }
    entries.push(canonical);
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  const normalizedExpected = [...expected].sort((a, b) => a.name.localeCompare(b.name));
  return {
    entries,
    valid:
      entries.length === normalizedExpected.length &&
      entries.every(
        (entry, index) =>
          entry.name === normalizedExpected[index].name &&
          entry.sha256 === normalizedExpected[index].sha256
      )
  };
}
