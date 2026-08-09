import path from 'path';
process.env.DATABASE_URL = `file:${path.resolve(__dirname, '../prisma/dev.db').replace(/\\/g, '/')}`;

import { PrismaClient } from '@prisma/client';
import { computeFromOrderHeader } from '../apps/api/src/gmv/gmv-order-header';

const prisma = new PrismaClient();

async function main() {
  console.log('--- 实时调用 computeFromOrderHeader(prisma, "2026-07-30") ---');
  const res = await computeFromOrderHeader(prisma as any, '2026-07-30');
  console.log('结果:', JSON.stringify(res, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
