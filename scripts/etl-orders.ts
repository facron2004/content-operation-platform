/**
 * 中台数据层：JeSite bargainOrder 订单 ETL
 *
 * 拉 JeSite bargainOrder/listData 翻页 → mapJeesiteOrderListToDataset → upsert 到
 *   - OrderHeader   (订单主表)
 *   - Member        (会员 dedupe,按 memberPhone 为主键)
 *
 * 不动：
 *   - OrderPoint (积分流转明细,JeSite 暂时没存有效数字,留空等后续 ETL)
 *
 * 运行: pnpm db:etl-orders
 * 环境: DATABASE_URL 必须指向 prisma/dev.db
 * JeSite 接口: EXTERNAL_API_BASE_URL / JEESITE_SESSION_ID cookie (复用 data-source.service 已有)
 *
 * 字段映射参考 apps/api/src/content/jeesite-bargain-adapter.ts:mapJeesiteOrderListToDataset
 */
import { PrismaClient } from '@prisma/client';
import { ensureDatabaseSchema } from '../prisma/seed-data';
import {
  mapJeesiteOrderListToDataset,
  type MappedOrderRecord
} from '../apps/api/src/content/jeesite-bargain-adapter';
import { upsertOrderHeaderIso } from '../apps/api/src/gmv/gmv-order-header';
import { recomputeDailyMetricsRange } from '../apps/api/src/money/daily-metrics-recompute';
import { recomputePackageSalesAmountRange } from '../apps/api/src/money/package-sales-amount';
import { moneyFenExtension } from '../apps/api/src/prisma/money-fen-extension';

// $extends(moneyFenExtension)：Phase 3 双写——本脚本的 ORM 写（member.create/update）
// 自动注入 *Fen 列；原生 SQL 写（upsertOrderHeaderIso）已在 SQL 内显式双写。
const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db' }
  }
}).$extends(moneyFenExtension) as unknown as PrismaClient;

const EXTERNAL_API_BASE_URL = process.env.EXTERNAL_API_BASE_URL ?? '';
const JEESITE_SESSION_ID = process.env.JEESITE_SESSION_ID ?? process.env.JEESITE_COOKIE ?? '';
const PAGE_SIZE = 50;
const MAX_PAGES = Number(process.env.ETL_MAX_PAGES ?? '20');

if (!EXTERNAL_API_BASE_URL) {
  console.error('❌ EXTERNAL_API_BASE_URL 未设置 (例如 http://jeesite.local/admin)');
  process.exit(1);
}
if (!JEESITE_SESSION_ID) {
  console.error('❌ JEESITE_SESSION_ID (或 JEESITE_COOKIE) 未设置');
  process.exit(1);
}

interface JqGridPayload<T = Record<string, unknown>> {
  page?: { pageNo: number; pageSize: number; totalRow: number; totalPage: number };
  rows?: T[];
  // 兼容部分 JeSite 版本把 rows 直接放在根
  [k: string]: unknown;
}

function unwrapRows<T = Record<string, unknown>>(payload: JqGridPayload<T>): T[] {
  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray((payload as { list?: T[] }).list)) return (payload as { list: T[] }).list;
  if (Array.isArray(payload as unknown as T[])) return payload as unknown as T[];
  if (Array.isArray((payload as { data?: T[] }).data)) return (payload as { data: T[] }).data;
  return [];
}

async function fetchPage(
  pageNo: number,
  screeningStartPayDate?: string,
  screeningEndPayDate?: string
): Promise<JqGridPayload> {
  const url = new URL(`${EXTERNAL_API_BASE_URL.replace(/\/$/, '')}/bargain/bargainOrder/listData`);
  url.searchParams.set('pageNo', String(pageNo));
  url.searchParams.set('pageSize', String(PAGE_SIZE));
  if (screeningStartPayDate) url.searchParams.set('screeningStartPayDate', screeningStartPayDate);
  if (screeningEndPayDate) url.searchParams.set('screeningEndPayDate', screeningEndPayDate);

  const res = await fetch(url.toString(), {
    headers: {
      Cookie: JEESITE_SESSION_ID.startsWith('jeesite.session.id=')
        ? JEESITE_SESSION_ID
        : `jeesite.session.id=${JEESITE_SESSION_ID}`
    }
  });
  if (!res.ok) {
    throw new Error(`JeSite bargainOrder/listData HTTP ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as JqGridPayload;
}

async function upsertOrder(order: MappedOrderRecord) {
  // ISO-text raw upsert — Prisma DateTime writes integer epoch and breaks GMV day filters
  await upsertOrderHeaderIso(prisma as never, order);
}

async function upsertMember(order: MappedOrderRecord) {
  if (!order.memberId || order.memberId.startsWith('unknown_')) return;
  // 用 memberPhone 兜底作为唯一键
  const key = order.memberId;
  const data = {
    memberId: key,
    nickname: order.memberName || null,
    phone: order.memberPhone || null,
    totalGmv: order.paidAmount,
    totalOrders: 1
  } as const;
  const inviteData = {
    ...(order.inviteCode ? { inviteCode: order.inviteCode } : {}),
    ...(order.parentInviteCode ? { parentInviteCode: order.parentInviteCode } : {})
  };
  const existing = await prisma.member.findUnique({ where: { memberId: key } });
  if (!existing) {
    await prisma.member.create({
      data: { ...data, ...inviteData, firstOrderAt: new Date(order.orderTime) }
    });
  } else {
    await prisma.member.update({
      where: { memberId: key },
      data: {
        nickname: data.nickname ?? existing.nickname,
        phone: data.phone ?? existing.phone,
        totalGmv: existing.totalGmv + data.totalGmv,
        totalOrders: existing.totalOrders + 1,
        lastOrderAt: new Date(order.orderTime),
        ...inviteData
      }
    });
  }
}

async function main() {
  await ensureDatabaseSchema(prisma);

  const args = process.argv.slice(2);
  const startDate = args[0] || '2026-07-01';
  const endDate = args[1] || new Date().toISOString().slice(0, 10);
  console.log(`[etl-orders] JeSite: ${EXTERNAL_API_BASE_URL}`);
  console.log(`[etl-orders] 拉取窗口: ${startDate} → ${endDate}`);

  let pageNo = 1;
  let totalFetched = 0;
  let totalUpserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (let i = 0; i < MAX_PAGES; i++) {
    let payload: JqGridPayload;
    try {
      payload = await fetchPage(pageNo, `${startDate} 00:00:00`, `${endDate} 23:59:59`);
    } catch (err) {
      console.error(`[etl-orders] ❌ 第 ${pageNo} 页拉取失败:`, (err as Error).message);
      break;
    }
    const rows = unwrapRows(payload);
    if (rows.length === 0) {
      console.log(`[etl-orders] 第 ${pageNo} 页为空,结束翻页`);
      break;
    }
    totalFetched += rows.length;

    const { orders } = mapJeesiteOrderListToDataset(payload);
    for (const o of orders) {
      if (!o.orderId) {
        totalSkipped += 1;
        continue;
      }
      try {
        await upsertMember(o);
        await upsertOrder(o);
        totalUpserted += 1;
      } catch (err) {
        totalErrors += 1;
        if (totalErrors < 5) {
          console.error(`[etl-orders] 订单 ${o.orderId} upsert 失败:`, (err as Error).message);
        }
      }
    }
    console.log(
      `[etl-orders] 第 ${pageNo}/${MAX_PAGES} 页: 拉取 ${rows.length} 条 → upsert ${orders.length} 条`
    );

    if (rows.length < PAGE_SIZE) break; // 末页
    pageNo += 1;
  }

  const finalCount = await prisma.orderHeader.count();
  const memberCount = await prisma.member.count();

  let dailyMetrics: unknown = null;
  let packageSalesAmount: unknown = null;
  try {
    dailyMetrics = await recomputeDailyMetricsRange(prisma, startDate, endDate);
    console.log('[etl-orders] DailyMetrics recompute', dailyMetrics);
  } catch (err) {
    console.warn('[etl-orders] DailyMetrics recompute failed:', (err as Error).message);
  }
  try {
    packageSalesAmount = await recomputePackageSalesAmountRange(prisma, startDate, endDate);
    console.log('[etl-orders] PackageSalesDaily salesAmount recompute', packageSalesAmount);
  } catch (err) {
    console.warn(
      '[etl-orders] PackageSalesDaily salesAmount recompute failed:',
      (err as Error).message
    );
  }

  console.log(
    JSON.stringify(
      {
        startDate,
        endDate,
        pagesFetched: pageNo,
        totalFetched,
        totalUpserted,
        totalSkipped,
        totalErrors,
        orderHeaderTotal: finalCount,
        memberTotal: memberCount,
        dailyMetrics,
        packageSalesAmount
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
