const path = require('path');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({ datasources: { db: { url: 'file:' + path.join(__dirname, '..', 'prisma', 'dev.db').replace(/\\/g, '/') } } });
(async () => {
  // 用 Prisma 的 date 函数（Prisma 会处理时区）
  const byDay = await p.orderHeader.groupBy({
    by: ['status'],
    _count: { _all: true },
    _sum: { paidAmount: true, paidAmountWallet: true, paidAmountBonus: true }
  });
  console.log('按 status:', JSON.stringify(byDay, (k, v) => typeof v === 'bigint' ? Number(v) : v, 2));

  // 时间范围
  const range = await p.orderHeader.aggregate({
    _min: { orderTime: true },
    _max: { orderTime: true },
    _count: { _all: true }
  });
  console.log('时间范围:', JSON.stringify(range, (k, v) => typeof v === 'bigint' ? Number(v) : v, 2));

  // 抽 7/14 的数据
  const july14 = await p.orderHeader.findMany({
    where: { orderTime: { gte: new Date('2026-07-14T00:00:00Z'), lt: new Date('2026-07-15T00:00:00Z') } },
    take: 3,
    select: { orderId: true, paidAmount: true, status: true, orderTime: true }
  });
  console.log('7/14 订单数（按 UTC 范围）:', july14.length);
  console.log('样本:', JSON.stringify(july14, null, 2));

  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });