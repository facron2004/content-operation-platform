const path = require('path');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: 'file:' + path.join(__dirname, '..', 'prisma', 'dev.db').replace(/\\/g, '/') } } });
(async () => {
  // 直接 ALTER ADD COLUMN
  await p.$executeRawUnsafe(`ALTER TABLE "OrderHeader" ADD COLUMN "merchantName" TEXT`);
  console.log('Added merchantName column');
  await p.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OrderHeader_merchantName_idx" ON "OrderHeader"("merchantName")`);
  console.log('Created index');
  // 验证
  const cols = await p.$queryRawUnsafe(`PRAGMA table_info('OrderHeader')`);
  console.log('OrderHeader 列:', cols.map(c => c.name).join(', '));
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });