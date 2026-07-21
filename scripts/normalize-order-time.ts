/* 一次性修复: 将 OrderHeader.orderTime 中"被原样存成的 Unix 时间戳字符串"
 * (10位=秒 / 13位=毫秒) 归一化为 ISO8601 UTC 字符串 (与现有 ...+00:00 格式一致)。
 *
 * 背景: JeeSite 老订单的 createDate 是数值 epoch, 适配器 dateText() 未处理数值,
 * 导致 4184 条缺口订单的 orderTime 存成了 "1782835200" 这类字符串, SQLite date()
 * 解析为 NULL, 无法按日聚合。
 *
 * 幂等: 只处理纯数字时间戳, 已为 ISO 的行跳过。DELETE 不会发生。
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL ?? 'file:E:/Program/Content Operation Platform/prisma/dev.db'
    }
  }
});

async function main() {
  const rows = await prisma.$queryRawUnsafe<Array<{ orderId: string; orderTime: string }>>(
    `SELECT "orderId", CAST("orderTime" AS TEXT) AS "orderTime" FROM "OrderHeader"`
  );

  let fixed = 0;
  let skipped = 0;
  let bad = 0;
  const samples: Array<{ from: string; to: string }> = [];

  for (const r of rows) {
    const v = String(r.orderTime ?? '').trim();
    if (/^\d{10}$/.test(v) || /^\d{13}$/.test(v)) {
      const n = Number(v);
      const ms = v.length === 10 ? n * 1000 : n; // 秒→毫秒
      const d = new Date(ms);
      if (Number.isNaN(d.getTime())) {
        bad++;
        continue;
      }
      const iso = d.toISOString().replace('Z', '+00:00');
      await prisma.$executeRawUnsafe(
        `UPDATE "OrderHeader" SET "orderTime" = ? WHERE "orderId" = ?`,
        iso,
        r.orderId
      );
      fixed++;
      if (samples.length < 5) samples.push({ from: v, to: iso });
    } else {
      skipped++;
    }
  }

  console.log(JSON.stringify({ total: rows.length, fixed, skipped, bad, samples }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
