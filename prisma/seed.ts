import { PrismaClient } from '@prisma/client';
import { ensureDatabaseSchema } from './seed-data';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db'
    }
  }
});

ensureDatabaseSchema(prisma)
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
