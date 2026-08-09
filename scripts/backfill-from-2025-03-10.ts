/**
 * 从 2025-03-10 开始分月重抓 JeeSite 订单并落库重算
 *
 * 运行:
 *   npx tsx scripts/backfill-from-2025-03-10.ts
 */
import path from 'node:path';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { beijingDateKey, isRecord } from '@content/shared';
import { ensureDatabaseSchema } from '../prisma/seed-data';
import { loginToJeesite, validateJeesiteCookie } from '../apps/api/src/content/auto-login-client';
import { mapJeesiteOrderListToDataset } from '../apps/api/src/content/jeesite-bargain-adapter';
import { batchUpsertOrderHeaders } from '../apps/api/src/gmv/gmv-order-header.upsert';
import { recomputeDailyMetricsRange } from '../apps/api/src/money/daily-metrics-recompute';
import { recomputePackageSalesAmountRange } from '../apps/api/src/money/package-sales-amount';
import { recomputeMerchantDailyMetrics } from '../apps/api/src/merchant-sales/merchant-sales-query';

config({ path: path.join(process.cwd(), '.env') });

const absDb = path.resolve(process.cwd(), 'prisma', 'dev.db').replace(/\\/g, '/');
const dbUrl = `file:${absDb}`;
process.env.DATABASE_URL = dbUrl;

const prisma = new PrismaClient({
  datasources: {
    db: { url: dbUrl }
  }
});

const BASE_URL = process.env.EXTERNAL_API_BASE_URL ?? '';
const USERNAME = process.env.EXTERNAL_API_USERNAME ?? '';
const PASSWORD = process.env.EXTERNAL_API_PASSWORD ?? '';

function getMonthlyChunks(startStr: string, endStr: string): Array<{ start: string; end: string }> {
  const chunks: Array<{ start: string; end: string }> = [];
  let curr = new Date(startStr + 'T00:00:00.000Z');
  const finalEnd = new Date(endStr + 'T00:00:00.000Z');

  while (curr <= finalEnd) {
    const year = curr.getUTCFullYear();
    const month = curr.getUTCMonth();
    const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0));

    const chunkStart = curr.toISOString().slice(0, 10);
    let chunkEnd = lastDayOfMonth.toISOString().slice(0, 10);
    if (lastDayOfMonth > finalEnd) {
      chunkEnd = endStr;
    }
    chunks.push({ start: chunkStart, end: chunkEnd });

    curr = new Date(Date.UTC(year, month + 1, 1));
  }
  return chunks;
}

async function getValidCookie(): Promise<string> {
  let envCookie = process.env.EXTERNAL_API_COOKIE || process.env.JEESITE_COOKIE || process.env.JEESITE_SESSION_ID || '';
  if (envCookie && !envCookie.includes('=')) {
    envCookie = `jeesite.session.id=${envCookie}`;
  }

  if (envCookie && (await validateJeesiteCookie(envCookie, BASE_URL))) {
    console.log('[Auth] Env Cookie 校验有效');
    return envCookie;
  }

  console.log('[Auth] Env Cookie 无效或未提供，正在自动登录 JeeSite ...');
  const result = await loginToJeesite({
    username: USERNAME,
    password: PASSWORD,
    baseUrl: BASE_URL,
    logger: console as never
  });

  if (!result.success || !result.cookie) {
    throw new Error(`JeeSite 自动登录失败: ${result.error || '未知错误'}`);
  }

  console.log('[Auth] JeeSite 登录成功！');
  return result.cookie;
}

async function fetchOrderPage(url: URL, cookie: string): Promise<unknown | null> {
  const res = await fetch(url.toString(), {
    headers: {
      Cookie: cookie,
      'x-ajax': 'json',
      Accept: 'application/json'
    }
  });

  if (!res.ok) {
    throw new Error(`JeeSite HTTP ${res.status}`);
  }

  const text = await res.text();
  if (text.trimStart().startsWith('<')) return null;

  try {
    const json = JSON.parse(text);
    if (isRecord(json) && json.result === 'login') return null;
    return json;
  } catch {
    return null;
  }
}

async function main() {
  await ensureDatabaseSchema(prisma);

  const startDate = '2025-03-10';
  const endDate = beijingDateKey(new Date());

  console.log(`=======================================================`);
  console.log(`开始数据重抓落库：${startDate} → ${endDate}`);
  console.log(`JeeSite Base URL: ${BASE_URL}`);
  console.log(`=======================================================`);

  let cookie = await getValidCookie();
  const chunks = getMonthlyChunks(startDate, endDate);

  let totalFetched = 0;
  let totalUpserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  const PAGE_SIZE = 50;

  for (let i = 0; i < chunks.length; i++) {
    const { start, end } = chunks[i];
    console.log(`\n[${i + 1}/${chunks.length}] 抓取区间: ${start} → ${end}`);

    let pageNo = 1;
    let chunkFetched = 0;
    let chunkUpserted = 0;
    let chunkSkipped = 0;
    let chunkErrors = 0;

    for (;;) {
      const url = new URL(`${BASE_URL.replace(/\/$/, '')}/bargain/bargainOrder/listData`);
      url.searchParams.set('pageNo', String(pageNo));
      url.searchParams.set('pageSize', String(PAGE_SIZE));
      url.searchParams.set('screeningStartPayDate', `${start} 00:00:00`);
      url.searchParams.set('screeningEndPayDate', `${end} 23:59:59`);

      let payload = await fetchOrderPage(url, cookie);
      if (!payload) {
        console.warn(`  ! Session 可能会会话过期，重新尝试登录...`);
        cookie = await getValidCookie();
        payload = await fetchOrderPage(url, cookie);
      }

      if (!isRecord(payload)) {
        console.error(`  ❌ 第 ${pageNo} 页返回非法 Payload，跳过本页`);
        break;
      }

      const rows = (payload.list ?? payload.rows ?? []) as Record<string, unknown>[];
      if (!Array.isArray(rows) || rows.length === 0) {
        break;
      }

      const { orders } = mapJeesiteOrderListToDataset(payload);
      if (orders.length > 0 && pageNo === 1) {
        console.log('Sample Mapped Order:', JSON.stringify(orders[0], null, 2));
      }
      const upsertResult = await batchUpsertOrderHeaders(prisma, orders, 35);
      if (upsertResult.errors > 0 && upsertResult.errorSamples.length > 0) {
        console.warn(`  ! 批量落库存在错误 (${upsertResult.errors} 条)，错误示例 ID:`, upsertResult.errorSamples);
      }

      chunkFetched += rows.length;
      chunkUpserted += upsertResult.upserted;
      chunkSkipped += upsertResult.skipped;
      chunkErrors += upsertResult.errors;

      if (pageNo % 5 === 0 || rows.length < PAGE_SIZE) {
        console.log(`  └─ 页码 ${pageNo}: 抓取 ${rows.length} 条 | 累积落库 ${chunkUpserted} 条`);
      }

      if (rows.length < PAGE_SIZE) break;
      pageNo++;
    }

    totalFetched += chunkFetched;
    totalUpserted += chunkUpserted;
    totalSkipped += chunkSkipped;
    totalErrors += chunkErrors;

    console.log(
      `  ✓ ${start} → ${end} 完成: 抓取 ${chunkFetched} 单 | 落库 ${chunkUpserted} 单 | 错误 ${chunkErrors} 单`
    );
  }

  console.log(`\n=======================================================`);
  console.log(`所有月份订单抓取完毕！总计抓取 ${totalFetched} 单，成功落库 ${totalUpserted} 单`);
  console.log(`=======================================================`);

  console.log(`\n正在重算 DailyMetrics 基础指标 [${startDate} → ${endDate}] ...`);
  try {
    const dm = await recomputeDailyMetricsRange(prisma, startDate, endDate);
    console.log(`DailyMetrics 重算完成:`, dm);
  } catch (err) {
    console.warn(`DailyMetrics 重算部分失败: ${(err as Error).message}`);
  }

  console.log(`\n正在重算 PackageSalesDaily 套餐销售金额 [${startDate} → ${endDate}] ...`);
  try {
    const psd = await recomputePackageSalesAmountRange(prisma, startDate, endDate);
    console.log(`PackageSalesDaily 重算完成: rowsUpserted=${psd.rowsUpserted}, coverage=${(psd.coverageRatio * 100).toFixed(1)}%`);
  } catch (err) {
    console.warn(`PackageSalesDaily 重算部分失败: ${(err as Error).message}`);
  }

  console.log(`\n正在重算 MerchantDailyMetrics 商家指标 [${startDate} → ${endDate}] ...`);
  try {
    const mdm = await recomputeMerchantDailyMetrics(prisma, startDate, endDate);
    console.log(`MerchantDailyMetrics 重算完成:`, mdm);
  } catch (err) {
    console.warn(`MerchantDailyMetrics 重算部分失败: ${(err as Error).message}`);
  }

  const orderCount = await prisma.orderHeader.count();
  const dmCount = await prisma.dailyMetrics.count();
  const mdmCount = await prisma.merchantDailyMetrics.count();

  console.log(`\n=======================================================`);
  console.log(`最终数据库状态校验：`);
  console.log(`  - OrderHeader 订单数: ${orderCount}`);
  console.log(`  - DailyMetrics 行数: ${dmCount}`);
  console.log(`  - MerchantDailyMetrics 行数: ${mdmCount}`);
  console.log(`=======================================================`);
}

main()
  .catch((err) => {
    console.error('脚本运行失败:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
