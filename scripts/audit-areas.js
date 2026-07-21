const path = require('path');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: 'file:' + path.join(__dirname, '..', 'prisma', 'dev.db').replace(/\\/g, '/') } } });
(async () => {
  const total = await p.orderHeader.count();
  const withArea = await p.orderHeader.count({ where: { NOT: { areaName: null } } });
  const withPackage = await p.orderHeader.count({ where: { NOT: { packageId: null } } });
  const withMerchant = await p.orderHeader.count({ where: { NOT: { merchantId: null } } });
  console.log('OrderHeader 总数:', total);
  console.log('有 areaName:', withArea);
  console.log('有 packageId:', withPackage);
  console.log('有 merchantId:', withMerchant);
  const sample = await p.orderHeader.findMany({ take: 5, select: { orderId: true, packageId: true, merchantId: true, areaId: true, areaName: true } });
  console.log('抽样:', JSON.stringify(sample, null, 2));
  const cp = await p.contentPackage.count();
  const cpWithArea = await p.contentPackage.count({ where: { NOT: { areaName: null } } });
  console.log('ContentPackage 总数:', cp, '有 areaName:', cpWithArea);
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });