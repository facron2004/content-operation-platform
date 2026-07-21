const path = require('path');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: 'file:' + path.join(__dirname, '..', 'prisma', 'dev.db').replace(/\\/g, '/') } } });
(async () => {
  const ohMerchants = await p.$queryRawUnsafe(`SELECT DISTINCT merchantId FROM OrderHeader WHERE merchantId IS NOT NULL LIMIT 20`);
  console.log('OrderHeader unique merchantId 样本:', ohMerchants);
  const ohIds = ohMerchants.map(r => r.merchantId);
  const cpMatch = await p.contentPackage.findMany({ where: { merchantId: { in: ohIds } }, select: { merchantId: true, merchantName: true, areaName: true, category: true }, take: 20 });
  console.log('ContentPackage 能匹配上的:', JSON.stringify(cpMatch, null, 2));
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });