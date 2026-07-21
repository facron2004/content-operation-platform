const path = require('path');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: 'file:' + path.join(__dirname, '..', 'prisma', 'dev.db').replace(/\\/g, '/') } } });
(async () => {
  const byStatus = await p.orderHeader.groupBy({ by: ['status'], _count: { _all: true } });
  console.log('OrderHeader 按 status:', JSON.stringify(byStatus, (k,v) => typeof v === 'bigint' ? Number(v) : v, 2));
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });