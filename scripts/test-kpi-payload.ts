import path from 'path';
process.env.DATABASE_URL = `file:${path.resolve(__dirname, '../prisma/dev.db').replace(/\\/g, '/')}`;

import { PrismaClient } from '@prisma/client';
import { resolveGmvKpis } from '../apps/api/src/gmv/gmv-resolve';

const prisma = new PrismaClient();

async function main() {
  const kpi = await resolveGmvKpis(prisma as any, '2026-07-30');
  console.log('=== resolveGmvKpis 2026-07-30 结果 ===');
  console.log(kpi);
}

main().catch(console.error).finally(() => prisma.$disconnect());
