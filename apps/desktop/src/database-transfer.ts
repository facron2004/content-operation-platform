import fs from 'node:fs';

export type SqliteRow = Record<string, unknown>;
export type SqliteStatement = string | { sql: string; args?: unknown[] };

export type SqliteClient = {
  execute: (statement: SqliteStatement) => Promise<{ rows?: SqliteRow[] }>;
  executeMultiple?: (sql: string) => Promise<unknown>;
  close: () => void;
};

export type SqliteClientFactory = (databasePath: string) => SqliteClient;

export type DatabaseInspection = {
  integrityOk: boolean;
  migrations: SqliteRow[];
  tableCounts: Record<string, number | null>;
};

const KEY_TABLES = [
  'AppUser',
  'OrderHeader',
  'ContentPackage',
  'Merchant',
  'Member',
  'JobRun',
  '_prisma_migrations'
] as const;
const SNAPSHOT_RELEASE_ATTEMPTS = 300;

function quoteSqlitePath(databasePath: string): string {
  return databasePath.replace(/\\/g, '/').replace(/'/g, "''");
}

function firstRowValue(rows: SqliteRow[] | undefined): unknown {
  const row = rows?.[0];
  if (!row) return undefined;
  return Object.values(row)[0];
}

export async function waitForSnapshotRelease(targetPath: string): Promise<void> {
  const probePath = `${targetPath}.release-check`;
  for (let attempt = 0; attempt < SNAPSHOT_RELEASE_ATTEMPTS; attempt += 1) {
    try {
      fs.renameSync(targetPath, probePath);
      fs.renameSync(probePath, targetPath);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EBUSY') throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`数据库快照文件仍被占用: ${targetPath}`);
}

export async function createConsistentSnapshot(
  sourcePath: string,
  targetPath: string,
  createClient: SqliteClientFactory
): Promise<void> {
  if (!fs.existsSync(sourcePath)) throw new Error(`源数据库不存在: ${sourcePath}`);
  if (fs.existsSync(targetPath)) throw new Error(`快照目标已存在: ${targetPath}`);

  const client = createClient(sourcePath);
  try {
    await client.execute(`VACUUM INTO '${quoteSqlitePath(targetPath)}'`);
  } finally {
    client.close();
  }

  if (!fs.existsSync(targetPath)) {
    throw new Error(`数据库快照未生成: ${targetPath}`);
  }
  await waitForSnapshotRelease(targetPath);
}

export async function inspectDatabase(
  databasePath: string,
  createClient: SqliteClientFactory
): Promise<DatabaseInspection> {
  if (!fs.existsSync(databasePath)) throw new Error(`数据库不存在: ${databasePath}`);

  const client = createClient(databasePath);
  try {
    const integrityRows = (await client.execute('PRAGMA integrity_check')).rows;
    const integrityOk = firstRowValue(integrityRows) === 'ok';
    const tableRows = (await client.execute(`SELECT name FROM sqlite_master WHERE type = 'table'`))
      .rows;
    const tables = new Set(tableRows?.map((row) => String(row.name)));
    const tableCounts: Record<string, number | null> = {};

    for (const table of KEY_TABLES) {
      if (!tables.has(table)) {
        tableCounts[table] = null;
        continue;
      }
      const countRows = (await client.execute(`SELECT COUNT(*) AS count FROM "${table}"`)).rows;
      tableCounts[table] = Number(firstRowValue(countRows) ?? 0);
    }

    const migrations = tables.has('_prisma_migrations')
      ? ((
          await client.execute(
            `SELECT migration_name, checksum, finished_at, rolled_back_at
           FROM "_prisma_migrations"
           ORDER BY migration_name`
          )
        ).rows ?? [])
      : [];

    return { integrityOk, migrations, tableCounts };
  } finally {
    client.close();
  }
}
