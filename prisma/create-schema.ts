import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { ensureDatabaseSchema } from './seed-data';

const dbUrl = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
const absPath = dbUrl.replace(/^file:(\.\/)?/, '');
const resolved = require('path').resolve(absPath).replace(/\\/g, '/');
const adapterUrl = /^[a-zA-Z]:\//.test(resolved) ? `file:///${resolved}` : resolved;

const adapter = new PrismaLibSQL({ url: adapterUrl });
const prisma = new PrismaClient({ adapter });

ensureDatabaseSchema(prisma)
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
