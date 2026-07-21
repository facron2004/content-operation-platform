const path = require('path');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: 'file:' + path.join(__dirname, '..', 'prisma', 'dev.db').replace(/\\/g, '/') } } });
(async () => {
  const cp = await p.contentPackage.findMany({ take: 5, select: { packageId: true, merchantId: true, merchantName: true, areaName: true, category: true } });
  console.log('ContentPackage 抽样:', JSON.stringify(cp, null, 2));
  // 查 OrderHeader 的 packageId (1575 这种短数字) 和 ContentPackage.packageId 的关联
  const oh = await p.orderHeader.findMany({ take: 5, select: { packageId: true, merchantId: true } });
  console.log('OrderHeader 抽样:', JSON.stringify(oh, null, 2));
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });