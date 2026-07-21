const path = require('path');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: 'file:' + path.join(__dirname, '..', 'prisma', 'dev.db').replace(/\\/g, '/') } } });
(async () => {
  // 找最近有数据的日期
  const lastDates = await p.$queryRawUnsafe(`
    SELECT date(datetime(snapshotTime/1000,'unixepoch')) AS d, COUNT(*) AS rows, SUM(paidAmountOnline) AS online
    FROM SalesSnapshot GROUP BY d ORDER BY d DESC LIMIT 10
  `);
  console.log('最近 10 个有数据的日期:', JSON.stringify(lastDates, (k, v) => typeof v === 'bigint' ? Number(v) : v, 2));

  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });