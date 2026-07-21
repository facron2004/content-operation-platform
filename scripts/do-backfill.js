const path = require('path');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: 'file:' + path.join(__dirname, '..', 'prisma', 'dev.db').replace(/\\/g, '/') } } });
(async () => {
  const r = await p.$executeRawUnsafe(`UPDATE SalesSnapshot SET paidAmountOnline = paidAmount WHERE paidAmount > 0`);
  console.log('UPDATE 影响行数:', r);
  const after = await p.$queryRawUnsafe(`SELECT COUNT(*) AS rows, SUM(paidAmount) AS paid, SUM(paidAmountOnline) AS online, SUM(paidAmountWallet) AS wallet, SUM(paidAmountBonus) AS bonus FROM SalesSnapshot`);
  console.log('回填后:', JSON.stringify(after, (k, v) => typeof v === 'bigint' ? Number(v) : v, 2));
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });