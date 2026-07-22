/**
 * Per-run database isolation — runs once before all tests in a worker.
 *
 * Sets DATABASE_URL to a temp SQLite file and ensures the full schema
 * is present. This keeps test databases isolated from the development
 * database and prevents cross-contamination between runs.
 */
import { mkdirSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const tmpDir = join(__dirname, '..', '..', '..', '..', '.tmp-test-db');
mkdirSync(tmpDir, { recursive: true });

const dbPath = join(tmpDir, 'test-run.db').replace(/\\/g, '/');
process.env.DATABASE_URL = `file:${dbPath}`;

// Lazily ensure schema exists — only the first setup actually creates tables.
// Subsequent runs (same PID) hit the already-populated DB.
const prisma = new PrismaClient();
try {
  await prisma.$queryRawUnsafe(`SELECT count(*) FROM "ContentPackage"`);
} catch {
  const { ensureDatabaseSchema } = await import('../../../../prisma/seed-data');
  await ensureDatabaseSchema(prisma);
}
await prisma.$disconnect();
