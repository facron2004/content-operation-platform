/**
 * 全量重抓商品品类（Category Re-fetch v2）
 *
 * 目标：让 ContentPackage.category 与 JeeSite 最新 tag 完全对齐。
 *
 * 步骤：
 *  1) 全量翻页抓取 JeeSite bargainCommodity/listData（含在售/已下架/回收站全部状态）
 *  2) 在售商品（bargainState=10）：复用 mapJeesiteBargainListToDataset 映射，
 *     完整 upsert（30 列，含 DistributionTask 冻结 merchantId/areaId/areaName 逻辑）
 *     —— 顺带补回本地缺失的在售商品、刷新品类与价格库存
 *  3) 非在售残留行（本地有、JeeSite 状态 -10/-20）：仅回填 category + updatedAt，
 *     不删除、不改其他字段
 *
 * 运行:
 *   DATABASE_URL="file:E:/Program/Content Operation Platform/prisma/dev.db" \
 *   tsx scripts/refetch-categories.ts
 */
import { PrismaClient } from '@prisma/client';
import { yuanToFen } from '@content/shared';
import * as fs from 'fs';
import * as path from 'path';
import { toSqliteDateTime } from '../apps/api/src/common/sqlite-datetime';
import {
  mapJeesiteBargainListToDataset,
  type DatasetOptions
} from '../apps/api/src/content/jeesite-bargain-adapter';

// ── env 加载（.env 在项目根） ───────────────────────────────────────────────
function loadDotEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  const txt = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

const env = loadDotEnv(path.join(__dirname, '..', '.env'));
const BASE_URL = env.EXTERNAL_API_BASE_URL ?? '';
const COOKIE = env.EXTERNAL_API_COOKIE ?? '';
const TOKEN = env.EXTERNAL_API_TOKEN ?? '';
if (!BASE_URL) {
  console.error('❌ EXTERNAL_API_BASE_URL 未设置');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db' }
  }
});

const PAGE_SIZE = 100;
const MAX_PAGES = Number(env.EXTERNAL_MAX_PAGES ?? 100);

interface Row {
  [k: string]: unknown;
}

function rowId(r: Row): string {
  const v =
    r.id ?? r.commodityId ?? r.commodity_id ?? r.goodsId ?? r.goods_id ?? r.packageId ?? r.package_id;
  return v == null ? '' : String(v).trim();
}

function rowText(r: Row, keys: string[], fallback = ''): string {
  for (const key of keys) {
    let cur: unknown = r;
    let ok = true;
    for (const part of key.split('.')) {
      if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[part];
      } else {
        ok = false;
        break;
      }
    }
    if (ok && cur != null && cur !== '') return String(cur).trim();
  }
  return fallback;
}

/** 按点路径取任意 JSON 字段值（含嵌套 bargainCommodityDynamic.*），不存在返回 undefined */
function rowField(r: Row, keys: string[]): unknown {
  for (const key of keys) {
    let cur: unknown = r;
    let ok = true;
    for (const part of key.split('.')) {
      if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[part];
      } else {
        ok = false;
        break;
      }
    }
    if (ok && cur !== undefined && cur !== null) return cur;
  }
  return undefined;
}

function categoryOf(r: Row): string {
  return rowText(
    r,
    [
      'categoryName',
      'category_name',
      'category',
      'typeName',
      'type_name',
      'bargainCommodityTag.name',
      'tagName'
    ],
    '未分类'
  );
}

async function fetchPage(pageNo: number): Promise<{ list: Row[]; count: number; pageSize: number }> {
  const url = `${BASE_URL.replace(/\/$/, '')}/bargain/bargainCommodity/listData?pageSize=${PAGE_SIZE}&pageNo=${pageNo}`;
  const res = await fetch(url, {
    headers: {
      'x-ajax': 'json',
      'Accept-Encoding': 'gzip, deflate',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(COOKIE ? { Cookie: COOKIE } : {})
    },
    redirect: 'manual'
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ page ${pageNo}`);
  const text = await res.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`非 JSON 响应 @ page ${pageNo}: ${text.slice(0, 200)}`);
  }
  if (payload.result === 'login') {
    throw new Error(`登录过期 @ page ${pageNo}，请先运行 scripts/refresh-jeesite-session.js`);
  }
  const list = Array.isArray(payload.list) ? (payload.list as Row[]) : [];
  return {
    list,
    count: Number(payload.count ?? 0) || 0,
    pageSize: Number(payload.pageSize ?? PAGE_SIZE) || PAGE_SIZE
  };
}

async function main() {
  // 1) 全量翻页抓取
  console.log('▶ 开始全量抓取 JeeSite 商品...');
  const first = await fetchPage(1);
  const totalCount = first.count;
  const totalPages = Math.min(Math.ceil(totalCount / first.pageSize), MAX_PAGES);
  console.log(`  总数 ${totalCount} 条，${totalPages} 页`);

  const all: Row[] = [...first.list];
  for (let p = 2; p <= totalPages; p++) {
    const page = await fetchPage(p);
    all.push(...page.list);
    if (p % 5 === 0 || p === totalPages) {
      console.log(`  已抓 ${all.length}/${totalCount} 条 (page ${p}/${totalPages})`);
    }
  }
  console.log(`  抓取完成：${all.length} 条`);

  // 2) JeeSite 侧品类分布
  const remoteCatDist = new Map<string, number>();
  for (const r of all) {
    const c = categoryOf(r);
    remoteCatDist.set(c, (remoteCatDist.get(c) ?? 0) + 1);
  }
  console.log('\n── JeeSite 品类分布（远端全量）──');
  for (const [c, n] of [...remoteCatDist.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${c}`);
  }

  // 3) 在售商品：完整 upsert（复用生产映射）
  console.log('\n▶ 在售商品完整 upsert（30 列 + 冻结逻辑）...');
  const datasetOptions: DatasetOptions = { baseUrl: BASE_URL };
  const { packages } = mapJeesiteBargainListToDataset({ list: all }, datasetOptions);
  console.log(`  映射出在售 packages: ${packages.length}`);

  const BATCH = 100;
  let upserted = 0;
  for (let i = 0; i < packages.length; i += BATCH) {
    const batch = packages.slice(i, i + BATCH);
    const vc = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
    const now = toSqliteDateTime();
    const params = batch.flatMap((p) => [
      p.packageId,
      p.packageName,
      p.packageType,
      p.merchantId,
      p.merchantName,
      p.areaId,
      p.areaName,
      p.category,
      yuanToFen(p.originalPrice),
      yuanToFen(p.salePrice),
      p.welfarePrice == null ? null : yuanToFen(p.welfarePrice),
      p.commissionRate,
      yuanToFen(p.grossProfit),
      p.stockTotal,
      p.stockLeft,
      p.startTime,
      p.endTime,
      JSON.stringify(p.useRules),
      JSON.stringify(p.sellingPoints),
      p.miniProgramPath,
      p.detailSummary ?? null,
      p.saleStatus ?? null,
      p.merchantCooperationScore,
      82,
      80,
      82,
      p.shopId ?? null,
      p.merchantAddress ?? null,
      null, // fallbackPackageId
      now
    ]);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ContentPackage" (
        "packageId","packageName","packageType","merchantId","merchantName",
        "areaId","areaName","category",
        "originalPriceFen","salePriceFen",
        "welfarePriceFen","commissionRate",
        "grossProfitFen","stockTotal","stockLeft",
        "startTime","endTime","useRules","sellingPoints",
        "miniProgramPath","detailSummary","saleStatus","merchantCooperationScore",
        "areaMatchScore","timeMatchScore","historyScore",
        "shopId","merchantAddress","fallbackPackageId","updatedAt"
      ) VALUES ${vc}
      ON CONFLICT("packageId") DO UPDATE SET
        "packageName"=excluded."packageName","merchantName"=excluded."merchantName",
        "merchantId"=CASE
          WHEN EXISTS (
            SELECT 1 FROM "DistributionTask" t
            WHERE t."packageId" = "ContentPackage"."packageId"
              AND t."status" NOT IN ('completed', 'cancelled', 'failed')
          ) THEN "ContentPackage"."merchantId"
          ELSE excluded."merchantId"
        END,
        "areaId"=CASE
          WHEN EXISTS (
            SELECT 1 FROM "DistributionTask" t
            WHERE t."packageId" = "ContentPackage"."packageId"
              AND t."status" NOT IN ('completed', 'cancelled', 'failed')
          ) THEN "ContentPackage"."areaId"
          ELSE excluded."areaId"
        END,
        "areaName"=CASE
          WHEN EXISTS (
            SELECT 1 FROM "DistributionTask" t
            WHERE t."packageId" = "ContentPackage"."packageId"
              AND t."status" NOT IN ('completed', 'cancelled', 'failed')
          ) THEN "ContentPackage"."areaName"
          ELSE excluded."areaName"
        END,
        "category"=excluded."category",
        "salePriceFen"=excluded."salePriceFen",
        "stockTotal"=excluded."stockTotal",
        "stockLeft"=excluded."stockLeft","saleStatus"=excluded."saleStatus",
        "shopId"=COALESCE(NULLIF(excluded."shopId",''),"ContentPackage"."shopId"),
        "merchantAddress"=excluded."merchantAddress",
        "updatedAt"=excluded."updatedAt"`,
      ...params
    );
    upserted += batch.length;
  }
  console.log(`  在售商品 upsert 完成: ${upserted}`);

  // 4) 非在售残留行：回填 category + 库存 + saleStatus（状态同样对齐 JeeSite）
  console.log('\n▶ 非在售残留行回填 category + 库存 + 状态 ...');
  const remoteById = new Map(all.map((r) => [rowId(r), r]));
  const sellingIds = new Set(packages.map((p) => p.packageId));
  const localAll = await prisma.contentPackage.findMany({
    select: { packageId: true, category: true, saleStatus: true }
  });
  const residual: {
    packageId: string;
    category: string;
    stockTotal: number;
    stockLeft: number;
    saleStatus: string | null;
  }[] = [];
  const noRemote: string[] = [];
  for (const row of localAll) {
    if (sellingIds.has(row.packageId)) continue; // 已在步骤 3 覆盖
    const remote = remoteById.get(row.packageId);
    if (!remote) {
      noRemote.push(row.packageId);
      continue;
    }
    const cat = categoryOf(remote);
    const stockTotal = Math.max(
      0,
      Math.round(
        Number(
          rowField(remote, ['bargainCommodityDynamic.initialInventoryTotal', 'bargainCommodityDynamic.inventoryTotal', 'inventory']) ?? 0
        ) || 0
      )
    );
    const hasInv = Math.round(Number(rowField(remote, ['bargainCommodityDynamic.hasInventory']) ?? NaN));
    const stockLeft =
      Number.isFinite(hasInv) && hasInv >= 0
        ? hasInv
        : Math.max(0, Math.round(Number(rowField(remote, ['inventory']) ?? 0) || 0));
    // 状态对齐：JeeSite bargainState=10 → selling；-20 → recycle；其余(-10) → pending
    const remoteState = Math.round(Number(rowField(remote, ['bargainState']) ?? -10) || -10);
    const saleStatus = remoteState === 10 ? 'selling' : remoteState === -20 ? 'recycle' : 'pending';
    residual.push({
      packageId: row.packageId,
      category: cat,
      stockTotal,
      stockLeft,
      saleStatus
    });
  }
  console.log(`  非在售残留需回填: ${residual.length} 条`);
  const now = toSqliteDateTime();
  for (const r of residual) {
    // 残留行已存在于表内，直接用 UPDATE（INSERT...ON CONFLICT 会先校验
    // 其它 NOT NULL 列导致 packageName 报错）
    await prisma.$executeRawUnsafe(
      `UPDATE "ContentPackage" SET "category" = ?, "stockTotal" = ?, "stockLeft" = ?, "saleStatus" = ?, "updatedAt" = ? WHERE "packageId" = ?`,
      r.category,
      r.stockTotal,
      r.stockLeft,
      r.saleStatus,
      now,
      r.packageId
    );
  }
  console.log(`  JeeSite 已无此商品（保留原值）: ${noRemote.length}${noRemote.length ? ` ids=${noRemote.join(',')}` : ''}`);

  // 5) 复查未分类
  const leftoverRows = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM "ContentPackage" WHERE "category" IS NULL OR "category" = '' OR "category" = '未分类'`
  )) as Array<{ c: number | bigint }>;
  const leftover = Number(leftoverRows[0]?.c ?? 0);
  console.log(`\n回填后仍为 未分类/空: ${leftover}`);

  // 6) 回填后本地分布
  const after = await prisma.contentPackage.groupBy({
    by: ['category'],
    _count: { _all: true }
  });
  console.log('\n── 回填后本地 ContentPackage 品类分布 ──');
  const total = after.reduce((s, g) => s + g._count._all, 0);
  for (const g of [...after].sort((a, b) => b._count._all - a._count._all)) {
    console.log(`  ${String(g._count._all).padStart(5)}  ${g.category}`);
  }
  console.log(`  合计: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
