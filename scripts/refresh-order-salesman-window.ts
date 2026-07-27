/**
 * Re-pull JeSite bargainOrder/listData for a paid-date window and upsert
 * OrderHeader including salesman / parentSalesman / coupon / orderCode.
 *
 * Uses the fixed mapJeesiteOrderListToDataset (businessUserName → salesman)
 * and the ISO-text batch upsert path.
 *
 * Usage:
 *   npx tsx scripts/refresh-order-salesman-window.ts [startDate] [endDate]
 * Default: today-1 → today (Beijing-ish, machine local date is fine for CLI).
 */
import path from 'node:path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { mapJeesiteOrderListToDataset } from '../apps/api/src/content/jeesite-bargain-adapter';
import { batchUpsertOrderHeaders } from '../apps/api/src/gmv/gmv-order-header.upsert';
import { ensureDatabaseSchema } from '../prisma/seed-data';

config({ path: path.join(process.cwd(), '.env') });

const BASE = (process.env.EXTERNAL_API_BASE_URL ?? '').replace(/\/$/, '');
const rawCookie =
  process.env.EXTERNAL_API_COOKIE ??
  process.env.JEESITE_COOKIE ??
  process.env.JEESITE_SESSION_ID ??
  '';
const sid = (rawCookie.match(/jeesite\.session\.id=([^;]+)/) || [])[1];
const cookie = sid ? `jeesite.session.id=${sid}` : rawCookie;

const absDb = path.resolve(process.cwd(), 'prisma', 'dev.db').replace(/\\/g, '/');
const prisma = new PrismaClient({ datasources: { db: { url: 'file:' + absDb } } });

const PAGE = 50;
const MAX_PAGES = Number(process.env.ETL_MAX_PAGES ?? '80');

function todayKey(): string {
  const d = new Date();
  // Beijing date for default window
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  return bj.toISOString().slice(0, 10);
}

function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

async function fetchPage(pageNo: number, startDate: string, endDate: string) {
  const url =
    `${BASE}/bargain/bargainOrder/listData?pageNo=${pageNo}&pageSize=${PAGE}` +
    `&screeningStartPayDate=${encodeURIComponent(startDate + ' 00:00:00')}` +
    `&screeningEndPayDate=${encodeURIComponent(endDate + ' 23:59:59')}`;
  const res = await fetch(url, {
    headers: { Cookie: cookie, 'x-ajax': 'json', Accept: 'application/json' },
    redirect: 'manual'
  });
  if (res.status !== 200) {
    throw new Error(`HTTP ${res.status} loc=${res.headers.get('location') ?? ''}`);
  }
  return (await res.json()) as {
    result?: string;
    list?: unknown[];
    rows?: unknown[];
    count?: number;
  };
}

async function main() {
  const args = process.argv.slice(2);
  const endDate = args[1] || todayKey();
  const startDate = args[0] || shiftKey(endDate, -1);

  if (!BASE || !cookie.includes('jeesite.session.id')) {
    console.error('missing EXTERNAL_API_BASE_URL or EXTERNAL_API_COOKIE');
    process.exit(1);
  }

  console.log(`[refresh-order-salesman] ${startDate} → ${endDate}`);
  console.log(`[refresh-order-salesman] BASE=${BASE} db=${absDb}`);
  await ensureDatabaseSchema(prisma as never);

  let pageNo = 1;
  let fetched = 0;
  let mappedWithSales = 0;
  let mappedWithCode = 0;
  const allOrders: ReturnType<typeof mapJeesiteOrderListToDataset>['orders'] = [];

  for (let i = 0; i < MAX_PAGES; i++) {
    const body = await fetchPage(pageNo, startDate, endDate);
    if (body.result === 'login') throw new Error('login expired — refresh cookie');
    const rows = (body.list ?? body.rows ?? []) as unknown[];
    const total = Number(body.count ?? 0);
    if (!rows.length) {
      console.log(`page ${pageNo}: empty, stop`);
      break;
    }
    const { orders } = mapJeesiteOrderListToDataset({ list: rows });
    allOrders.push(...orders);
    fetched += rows.length;
    const s = orders.filter((o) => o.salesman).length;
    const c = orders.filter((o) => o.orderCode).length;
    mappedWithSales += s;
    mappedWithCode += c;
    console.log(
      `page ${pageNo}: +${rows.length} mapped=${orders.length} sales=${s} code=${c} acc=${fetched}/${total || '?'}`
    );
    if (rows.length < PAGE || (total && fetched >= total)) break;
    pageNo++;
  }

  console.log(
    `[refresh-order-salesman] mapped total=${allOrders.length} withSales=${mappedWithSales} withCode=${mappedWithCode}`
  );

  const result = await batchUpsertOrderHeaders(prisma as never, allOrders, 35);
  console.log('[refresh-order-salesman] upsert', result);

  // Keep DailyMetrics in sync — otherwise GMV cockpit keeps the pre-refresh partial-day row.
  try {
    const { recomputeDailyMetricsRange } =
      await import('../apps/api/src/money/daily-metrics-recompute');
    const dm = await recomputeDailyMetricsRange(prisma as never, startDate, endDate);
    console.log('[refresh-order-salesman] DailyMetrics recompute', dm);
  } catch (e) {
    console.warn('[refresh-order-salesman] DailyMetrics recompute failed:', (e as Error).message);
  }

  // Window stats by paid day (accept space or ISO forms)
  const stats = await prisma.$queryRawUnsafe(
    `SELECT
       substr(replace(replace(paidTime,'T',' '),'.000Z',''),1,10) AS d,
       COUNT(*) AS total,
       SUM(CASE WHEN NULLIF(TRIM(COALESCE(salesman,'')), '') IS NOT NULL THEN 1 ELSE 0 END) AS withSales,
       SUM(CASE WHEN NULLIF(TRIM(COALESCE(orderCode,'')), '') IS NOT NULL THEN 1 ELSE 0 END) AS withCode
     FROM OrderHeader
     WHERE paidTime IS NOT NULL
       AND substr(replace(replace(paidTime,'T',' '),'.000Z',''),1,10) BETWEEN ? AND ?
     GROUP BY d
     ORDER BY d`,
    startDate,
    endDate
  );
  console.log('[refresh-order-salesman] db by day:');
  for (const r of stats as Array<Record<string, unknown>>) {
    console.log(`  ${r.d}: total=${r.total} salesman=${r.withSales} orderCode=${r.withCode}`);
  }

  console.log(
    JSON.stringify(
      {
        startDate,
        endDate,
        pagesFetched: pageNo,
        fetched,
        mapped: allOrders.length,
        mappedWithSales,
        mappedWithCode,
        upserted: result.upserted,
        skipped: result.skipped,
        errors: result.errors
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
