import { createClient } from '@libsql/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { PrismaClient } from '@prisma/client';
import { resolve } from 'path';

async function main() {
  const dbPath = resolve('./prisma/dev.db').replace(/\\/g, '/');
  const libsql = createClient({ url: `file:///${dbPath}` });
  const adapter = new PrismaLibSQL(libsql);
  const prisma = new PrismaClient({ adapter });

  const tables = await prisma.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  );
  console.log('Tables:', tables.map((t) => t.name).join(', '));

  for (const table of [
    'GeneratedCopy',
    'CopyPerformance',
    'RuleConfig',
    'SalesSnapshot',
    'OrderHeader'
  ]) {
    const cols = await prisma.$queryRawUnsafe<{ name: string; type: string }[]>(
      `PRAGMA table_info("${table}")`
    );
    console.log(`${table}:`, cols.map((c) => `${c.name}(${c.type})`).join(', '));
  }

  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
