const path = require('path');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: 'file:' + path.join(__dirname, '..', 'prisma', 'dev.db').replace(/\\/g, '/') } } });
(async () => {
  // 7/14 区间(用 UTC 边界)
  const rows = await p.orderHeader.findMany({
    where: { orderTime: { gte: new Date('2026-07-14T00:00:00Z'), lt: new Date('2026-07-15T00:00:00Z') } },
    select: { orderId: true, paidAmount: true, paidAmountWallet: true, paidAmountBonus: true, paidAmountCard: true, orderTime: true, status: true }
  });
  let sPaid = 0, sWallet = 0, sBonus = 0, sCard = 0;
  for (const r of rows) {
    sPaid += Number(r.paidAmount);
    sWallet += Number(r.paidAmountWallet);
    sBonus += Number(r.paidAmountBonus);
    sCard += Number(r.paidAmountCard);
  }
  console.log('7/14 数据库 OrderHeader 累加:');
  console.log('  paidAmount (在线):', sPaid.toFixed(2));
  console.log('  paidAmountWallet (余额):', sWallet.toFixed(2));
  console.log('  paidAmountBonus (积分):', sBonus.toFixed(2));
  console.log('  paidAmountCard (储值卡):', sCard.toFixed(2));
  console.log('  订单数:', rows.length);
  console.log('  GMV (paid+wallet):', (sPaid + sWallet).toFixed(2));
  console.log('');
  // 用 createDate 的本地时间分类(因为 orderTime 已经是 UTC 转换过的)
  // 看本地 7/14 是哪些
  const beijingStart = new Date('2026-07-14T00:00:00+08:00'); // 北京 0 点
  const beijingEnd = new Date('2026-07-15T00:00:00+08:00');
  const localRows = await p.orderHeader.findMany({
    where: { orderTime: { gte: beijingStart, lt: beijingEnd } },
    select: { paidAmount: true, paidAmountWallet: true, paidAmountBonus: true }
  });
  let lp = 0, lw = 0, lb = 0;
  for (const r of localRows) { lp += Number(r.paidAmount); lw += Number(r.paidAmountWallet); lb += Number(r.paidAmountBonus); }
  console.log('7/14 (北京时间) 数据库累加:');
  console.log('  订单数:', localRows.length);
  console.log('  paidAmount:', lp.toFixed(2));
  console.log('  paidAmountWallet:', lw.toFixed(2));
  console.log('  GMV (paid+wallet):', (lp + lw).toFixed(2));
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });