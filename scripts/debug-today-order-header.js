const path = require('path');
process.env.DATABASE_URL = `file:${path.resolve(__dirname, '../prisma/dev.db').replace(/\\/g, '/')}`;

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { computeFromOrderHeader } = require('../apps/api/dist/gmv/gmv-order-header');

async function main() {
  console.log('--- 调用 computeFromOrderHeader(prisma, "2026-07-30") ---');
  const res = await computeFromOrderHeader(prisma, '2026-07-30');
  console.log(JSON.stringify(res, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
