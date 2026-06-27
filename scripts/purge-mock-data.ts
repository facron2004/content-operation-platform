import { PrismaClient } from '@prisma/client';
import { ensureDatabaseSchema } from '../prisma/seed-data';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db'
    }
  }
});

const tables = [
  'CopyPerformance',
  'GeneratedCopy',
  'PromotionScore',
  'SalesSnapshot',
  'JeeSiteInventoryDailySnapshot',
  'ContentPackage'
] as const;

async function main() {
  await ensureDatabaseSchema(prisma);
  const result: Record<string, number> = {};
  for (const table of tables) {
    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM "${table}" WHERE "packageId" LIKE 'PKG%'`
    );
    result[table] = Number(deleted);
  }

  console.log(JSON.stringify({ removedMockRows: result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
