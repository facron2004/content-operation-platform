/**
 * Backfill all JeSite orders for a date range, using the fixed adapter and
 * ISO-text upsert. Avoids the decorator chain (gmv.dto → class-validator)
 * that tsx can't handle.
 *
 * Usage: npx tsx scripts/backfill-all-orders.ts [startDate] [endDate]
 * Default: 2026-02-01 → 2026-07-18
 */
import path from 'node:path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import {
  mapJeesiteOrderListToDataset,
  type MappedOrderRecord
} from '../apps/api/src/content/jeesite-bargain-adapter';
import { ensureDatabaseSchema } from '../prisma/seed-data';
import { yuanToFen } from '@content/shared';

config({ path: path.join(process.cwd(), '.env') });

const BASE = (process.env.EXTERNAL_API_BASE_URL ?? '').replace(/\/$/, '');
const rawCookie =
  process.env.EXTERNAL_API_COOKIE ??
  process.env.JEESITE_COOKIE ??
  process.env.JEESITE_SESSION_ID ??
  '';
const sid = (rawCookie.match(/jeesite\.session\.id=([^;]+)/) || [])[1];
const cookie = `jeesite.session.id=${sid}`;
const absDb = path.resolve(process.cwd(), 'prisma', 'dev.db').replace(/\\/g, '/');
const prisma = new PrismaClient({ datasources: { db: { url: 'file:' + absDb } } });

// Inline helpers — import avoids gmv-order-header → gmv.dto → class-validator
function toIsoText(v: string | Date | number | null | undefined): string | null {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function sharedFields(o: MappedOrderRecord) {
  return {
    memberId: o.memberId || null,
    packageId: o.packageId || null,
    merchantId: o.merchantId || null,
    merchantName: o.merchantName || null,
    areaId: o.areaId || null,
    areaName: o.areaName || null,
    orderTime: toIsoText(o.orderTime)!,
    paidTime: toIsoText(o.paidTime),
    verifyTime: toIsoText(o.verifyTime),
    refundTime: toIsoText(o.refundTime),
    orderAmount: o.orderAmount,
    paidAmount: o.paidAmount,
    paidAmountWallet: o.paidAmountWallet,
    paidAmountBonus: o.paidAmountBonus,
    refundAmount: o.refundAmount ?? 0,
    verifyAmount: o.verifyAmount ?? 0,
    status: o.status
  };
}
async function upsertRow(o: MappedOrderRecord): Promise<void> {
  if (!o.orderId) return;
  const f = sharedFields(o);
  const now = new Date().toISOString();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "OrderHeader" (
      "orderId","memberId","packageId","merchantId","merchantName",
      "areaId","areaName","orderTime","paidTime","verifyTime","refundTime",
      "orderAmount","orderAmountFen","paidAmount","paidAmountFen",
      "paidAmountWallet","paidAmountWalletFen","paidAmountBonus","paidAmountBonusFen",
      "paidAmountCard","paidAmountCardFen",
      "refundAmount","refundAmountFen","verifyAmount","verifyAmountFen",
      "pointEarned","pointUsed","status","channel",
      "createdAt","updatedAt"
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,?,?,?,?,?,?,?,'jeesite',?,?)
    ON CONFLICT("orderId") DO UPDATE SET
      "memberId"=excluded."memberId","packageId"=excluded."packageId",
      "merchantId"=excluded."merchantId","merchantName"=excluded."merchantName",
      "areaId"=excluded."areaId","areaName"=excluded."areaName",
      "orderTime"=excluded."orderTime","paidTime"=excluded."paidTime",
      "verifyTime"=excluded."verifyTime","refundTime"=excluded."refundTime",
      "orderAmount"=excluded."orderAmount","orderAmountFen"=excluded."orderAmountFen",
      "paidAmount"=excluded."paidAmount","paidAmountFen"=excluded."paidAmountFen",
      "paidAmountWallet"=excluded."paidAmountWallet",
      "paidAmountWalletFen"=excluded."paidAmountWalletFen",
      "paidAmountBonus"=excluded."paidAmountBonus",
      "paidAmountBonusFen"=excluded."paidAmountBonusFen",
      "refundAmount"=excluded."refundAmount","refundAmountFen"=excluded."refundAmountFen",
      "verifyAmount"=excluded."verifyAmount","verifyAmountFen"=excluded."verifyAmountFen",
      "pointEarned"=excluded."pointEarned","pointUsed"=excluded."pointUsed",
      "status"=excluded."status","channel"=excluded."channel",
      "updatedAt"=excluded."updatedAt"`,
    o.orderId,
    f.memberId,
    f.packageId,
    f.merchantId,
    f.merchantName,
    f.areaId,
    f.areaName,
    f.orderTime,
    f.paidTime,
    f.verifyTime,
    f.refundTime,
    f.orderAmount,
    yuanToFen(f.orderAmount),
    f.paidAmount,
    yuanToFen(f.paidAmount),
    f.paidAmountWallet,
    yuanToFen(f.paidAmountWallet),
    f.paidAmountBonus,
    yuanToFen(f.paidAmountBonus),
    f.refundAmount,
    yuanToFen(f.refundAmount),
    f.verifyAmount,
    yuanToFen(f.verifyAmount),
    o.pointEarned ?? 0,
    o.pointUsed ?? 0,
    f.status,
    now,
    now
  );
}

async function fetchMonth(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = month === 12 ? 31 : new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  console.log(`\n=== ${start} → ${end} ===`);
  const all: Record<string, unknown>[] = [];
  let pageNo = 1;
  const PAGE_SIZE = 50;
  const MAX_PAGES = 400;
  for (let i = 0; i < MAX_PAGES; i++) {
    const url =
      `${BASE}/bargain/bargainOrder/listData?pageNo=${pageNo}&pageSize=${PAGE_SIZE}` +
      `&screeningStartPayDate=${encodeURIComponent(start + ' 00:00:00')}` +
      `&screeningEndPayDate=${encodeURIComponent(end + ' 23:59:59')}`;
    const res = await fetch(url, {
      headers: { Cookie: cookie, 'x-ajax': 'json', Accept: 'application/json' }
    });
    const body = await res.json();
    if (body.result === 'login') throw new Error('login — refresh cookie');
    const rows = (body.list ?? body.rows ?? []) as Record<string, unknown>[];
    const total = body.count ?? 0;
    all.push(...rows);
    if (rows.length === 0 || all.length >= total) {
      console.log(`  page ${pageNo}: +${rows.length} acc=${all.length}/${total}  ✓ done`);
      break;
    }
    if (i % 10 === 9) console.log(`  page ${pageNo}: +${rows.length} acc=${all.length}/${total}`);
    pageNo++;
  }
  return all;
}

async function main() {
  const args = process.argv.slice(2);
  const defaultStart = '2026-02-01';
  const defaultEnd = '2026-07-18';
  const startDate = args[0] || defaultStart;
  const endDate = args[1] || defaultEnd;

  await ensureDatabaseSchema(prisma);
  if (!BASE || !sid) {
    console.error('missing BASE or cookie');
    process.exit(1);
  }
  console.log(`fetch ${startDate} → ${endDate}  BASE=${BASE}`);

  // split by month
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const months: [number, number][] = [];
  let cy = sy,
    cm = sm;
  while (cy < ey || (cy === ey && cm <= em)) {
    months.push([cy, cm]);
    cm++;
    if (cm > 12) {
      cm = 1;
      cy++;
    }
  }

  let total = 0,
    totalUpserted = 0;
  for (const [y, m] of months) {
    const rows = await fetchMonth(y, m);
    if (!rows.length) continue;
    const { orders } = mapJeesiteOrderListToDataset({ list: rows });
    total += rows.length;
    let upserted = 0;
    for (const o of orders) {
      if (!o.orderId) continue;
      try {
        await upsertRow(o);
        upserted++;
      } catch (e) {
        console.warn(`  FAIL ${o.orderId}: ${(e as Error).message}`);
      }
    }
    totalUpserted += upserted;
    console.log(`  upserted ${upserted} / ${orders.length}`);
  }

  console.log(`\n=== summary ===`);
  console.log(`total api rows: ${total}  upserted: ${totalUpserted}`);

  // Recompute DailyMetrics for the full range
  try {
    const { recomputeDailyMetricsRange } =
      await import('../apps/api/src/money/daily-metrics-recompute');
    const dm = await recomputeDailyMetricsRange(prisma, startDate, endDate);
    console.log('DailyMetrics recompute:', dm);
  } catch (e) {
    console.warn('DailyMetrics recompute failed:', (e as Error).message);
  }

  // Verify totals
  const ohCount = await prisma.$queryRawUnsafe(
    `SELECT date(datetime(paidTime,'+8 hours')) d, COUNT(*) c,
            COALESCE(SUM(paidAmount+paidAmountWallet),0) gmv,
            COALESCE(SUM(refundAmount),0) refund
     FROM OrderHeader WHERE paidTime IS NOT NULL GROUP BY d ORDER BY d`
  );
  console.log('\nverified daily totals:');
  for (const r of ohCount as Array<Record<string, number>>)
    console.log(
      `${r.d}: ${Number(r.c)} orders, gmv=${Number(r.gmv).toFixed(2)}, refund=${Number(r.refund).toFixed(2)}`
    );

  await prisma.$disconnect();
}
main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
