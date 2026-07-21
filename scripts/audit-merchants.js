const path = require('path');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: 'file:' + path.join(__dirname, '..', 'prisma', 'dev.db').replace(/\\/g, '/') } } });
(async () => {
  const total = await p.orderHeader.count();
  const withName = await p.orderHeader.count({ where: { NOT: { merchantName: null } } });
  console.log('OrderHeader 总数:', total, '有 merchantName:', withName);
  // 按 merchantName 聚合前 10
  const top = await p.$queryRawUnsafe(`
    SELECT merchantName, COUNT(*) AS orders, SUM(paidAmount + paidAmountWallet) AS gmv
    FROM OrderHeader
    WHERE status IN ('paid','verified') AND merchantName IS NOT NULL AND merchantName <> ''
    GROUP BY merchantName ORDER BY gmv DESC LIMIT 10
  `);
  console.log('Top 10 商家 (按 GMV):');
  top.forEach(r => console.log(' ', r.merchantName.padEnd(35), '单:', r.orders, 'GMV:', Number(r.gmv).toFixed(2)));
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });