#!/usr/bin/env node
/**
 * VNext 金额精度治理 Phase 2：历史回填（PRD §7.4.5 阶段二）
 *
 * 规则：新金额分 = round(旧金额 × 100)
 * 异常记录：空值 / 非法负数 / 小数位超过两位 / 超出安全范围 / 新旧汇总不一致
 *
 * 用法：node scripts/backfill-money-fen.mjs [--dry-run]
 * 输出：backups/money-fen-backfill-report.json
 *
 * 幂等：可重复执行，UPDATE 全量覆盖 *Fen 列。
 */
import { createClient } from '@libsql/client';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = `file:${ROOT.replace(/\\/g, '/')}/prisma/dev.db`;
const DRY_RUN = process.argv.includes('--dry-run');

/** 表 → [Float 列, Fen 列, 是否允许负数] */
const FIELD_MAP = {
  ContentPackage: [
    ['originalPrice', 'originalPriceFen', false],
    ['salePrice', 'salePriceFen', false],
    ['welfarePrice', 'welfarePriceFen', false],
    ['temporarySalePrice', 'temporarySalePriceFen', false],
    // 毛利可为负（亏本引流款）
    ['grossProfit', 'grossProfitFen', true]
  ],
  SalesSnapshot: [
    ['gmv', 'gmvFen', false],
    ['paidAmount', 'paidAmountFen', false],
    ['paidAmountOnline', 'paidAmountOnlineFen', false],
    ['paidAmountWallet', 'paidAmountWalletFen', false],
    ['paidAmountBonus', 'paidAmountBonusFen', false],
    ['paidAmountCard', 'paidAmountCardFen', false],
    ['refundAmount', 'refundAmountFen', false],
    ['verifyAmount', 'verifyAmountFen', false]
  ],
  CopyPerformance: [['gmv', 'gmvFen', false]],
  DailyMetrics: [
    ['totalGmv', 'totalGmvFen', false],
    ['gmvOnline', 'gmvOnlineFen', false],
    ['gmvWallet', 'gmvWalletFen', false],
    ['gmvBonus', 'gmvBonusFen', false],
    ['gmvCard', 'gmvCardFen', false],
    ['totalRefund', 'totalRefundFen', false],
    ['totalVerify', 'totalVerifyFen', false],
    ['paidAmountBonus', 'paidAmountBonusFen', false],
    ['paidAmountWallet', 'paidAmountWalletFen', false]
  ],
  OrderHeader: [
    ['orderAmount', 'orderAmountFen', false],
    ['paidAmount', 'paidAmountFen', false],
    ['paidAmountWallet', 'paidAmountWalletFen', false],
    ['paidAmountBonus', 'paidAmountBonusFen', false],
    ['paidAmountCard', 'paidAmountCardFen', false],
    ['refundAmount', 'refundAmountFen', false],
    ['verifyAmount', 'verifyAmountFen', false]
  ],
  Member: [
    ['walletBalance', 'walletBalanceFen', true],
    ['totalGmv', 'totalGmvFen', false]
  ],
  MerchantDailyMetrics: [
    ['paidAmountOnline', 'paidAmountOnlineFen', false],
    ['paidAmountWallet', 'paidAmountWalletFen', false],
    ['paidAmountBonus', 'paidAmountBonusFen', false],
    ['paidAmountCard', 'paidAmountCardFen', false],
    ['refundAmount', 'refundAmountFen', false],
    ['verifyAmount', 'verifyAmountFen', false]
  ],
  PackageSalesDaily: [['salesAmount', 'salesAmountFen', false]],
  MarketingCampaign: [
    ['budget', 'budgetFen', false],
    ['targetGmv', 'targetGmvFen', false]
  ],
  TaskPerformanceDaily: [
    ['gmv', 'gmvFen', false],
    ['verifyAmount', 'verifyAmountFen', false],
    ['refundAmount', 'refundAmountFen', false]
  ]
};

// JS 安全整数（分）：±9007199254740991 分 ≈ ±90 万亿元，防御性上限
const MAX_SAFE_FEN = Number.MAX_SAFE_INTEGER;

const client = createClient({ url: DB_PATH });
const report = {
  startedAt: new Date().toISOString(),
  dryRun: DRY_RUN,
  db: DB_PATH,
  tables: {},
  anomalies: [],
  reconcile: [],
  summary: { fieldsTotal: 0, fieldsBackfilled: 0, rowsUpdated: 0, anomalyCount: 0, reconcileMismatch: 0 }
};

async function scanAnomalies(table, col, allowNegative) {
  const found = [];
  // 空值（仅可空列会出现）
  const nullCnt = await client.execute(
    `SELECT COUNT(*) n FROM "${table}" WHERE "${col}" IS NULL`
  );
  if (Number(nullCnt.rows[0].n) > 0) {
    found.push({ table, column: col, type: '空值', count: Number(nullCnt.rows[0].n), action: '保持 Fen 为 NULL' });
  }
  // 非法负数
  if (!allowNegative) {
    const neg = await client.execute(
      `SELECT COUNT(*) n, MIN("${col}") mn FROM "${table}" WHERE "${col}" < 0`
    );
    if (Number(neg.rows[0].n) > 0) {
      found.push({ table, column: col, type: '非法负数', count: Number(neg.rows[0].n), min: neg.rows[0].mn, action: '照实转换并标记，待人工核对' });
    }
  }
  // 小数位超过两位（浮点容差 1e-6 分）
  const frac = await client.execute(
    `SELECT COUNT(*) n FROM "${table}" WHERE "${col}" IS NOT NULL AND ABS("${col}"*100 - ROUND("${col}"*100)) > 1e-6`
  );
  if (Number(frac.rows[0].n) > 0) {
    found.push({ table, column: col, type: '小数位超过两位', count: Number(frac.rows[0].n), action: 'round 到分，误差已吸收' });
  }
  // 超出安全范围
  const range = await client.execute(
    `SELECT COUNT(*) n FROM "${table}" WHERE "${col}" IS NOT NULL AND ABS("${col}"*100) > ${MAX_SAFE_FEN}`
  );
  if (Number(range.rows[0].n) > 0) {
    found.push({ table, column: col, type: '超出范围', count: Number(range.rows[0].n), action: '需人工处理，未回填' });
  }
  return found;
}

async function backfill(table, col, fenCol) {
  // ROUND() 返回 REAL，CAST 到 INTEGER 落入 SQLite 64 位整数列
  const sql = `UPDATE "${table}" SET "${fenCol}" = CAST(ROUND("${col}" * 100) AS INTEGER)
    WHERE "${col}" IS NOT NULL AND ABS("${col}"*100) <= ${MAX_SAFE_FEN}`;
  if (DRY_RUN) return 0;
  const r = await client.execute(sql);
  return r.rowsAffected ?? 0;
}

async function reconcile(table, col, fenCol) {
  // 新旧汇总一致性：SUM(round(float*100)) 必须等于 SUM(fen)，差异要求 0 分
  const r = await client.execute(
    `SELECT COALESCE(SUM(CAST(ROUND("${col}"*100) AS INTEGER)),0) oldSum,
            COALESCE(SUM("${fenCol}"),0) newSum,
            COUNT(*) rows
     FROM "${table}" WHERE "${col}" IS NOT NULL`
  );
  const { oldSum, newSum } = r.rows[0];
  const diff = BigInt(oldSum ?? 0) - BigInt(newSum ?? 0);
  return { table, column: col, fenColumn: fenCol, oldSumFen: String(oldSum), newSumFen: String(newSum), diffFen: String(diff), ok: diff === 0n };
}

(async () => {
  console.log(`金额精度 Phase 2 回填${DRY_RUN ? '（dry-run，仅扫描不写入）' : ''}`);
  console.log('='.repeat(60));

  for (const [table, fields] of Object.entries(FIELD_MAP)) {
    const t = { fields: fields.length, rowsUpdated: 0 };
    for (const [col, fenCol, allowNegative] of fields) {
      report.summary.fieldsTotal++;
      const anomalies = await scanAnomalies(table, col, allowNegative);
      report.anomalies.push(...anomalies);

      const updated = await backfill(table, col, fenCol);
      t.rowsUpdated += updated;
      report.summary.rowsUpdated += updated;
      report.summary.fieldsBackfilled++;

      if (!DRY_RUN) {
        const rec = await reconcile(table, col, fenCol);
        report.reconcile.push(rec);
        if (!rec.ok) report.summary.reconcileMismatch++;
      }
    }
    report.tables[table] = t;
    console.log(`  ${table}: ${t.fields} 列, 更新 ${t.rowsUpdated} 行次`);
  }

  report.summary.anomalyCount = report.anomalies.reduce((s, a) => s + (a.count || 0), 0);
  report.finishedAt = new Date().toISOString();

  mkdirSync(resolve(ROOT, 'backups'), { recursive: true });
  const out = resolve(ROOT, 'backups/money-fen-backfill-report.json');
  writeFileSync(out, JSON.stringify(report, null, 2));

  console.log('='.repeat(60));
  console.log(`字段: ${report.summary.fieldsBackfilled}/${report.summary.fieldsTotal} 已回填`);
  console.log(`行次: ${report.summary.rowsUpdated}`);
  console.log(`异常: ${report.summary.anomalyCount} 条（${report.anomalies.length} 类）`);
  for (const a of report.anomalies) {
    console.log(`  - [${a.type}] ${a.table}.${a.column}: ${a.count} 行（${a.action}）`);
  }
  console.log(`对账: ${report.reconcile.filter(r => r.ok).length}/${report.reconcile.length} 一致，不一致 ${report.summary.reconcileMismatch}`);
  console.log(`报告: ${out}`);

  client.close();
  if (report.summary.reconcileMismatch > 0) {
    console.error('存在新旧汇总不一致，请检查报告！');
    process.exit(1);
  }
})().catch((e) => {
  console.error('回填失败:', e.message);
  process.exit(1);
});
