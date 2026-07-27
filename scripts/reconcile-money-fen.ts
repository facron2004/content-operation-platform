/**
 * VNext 金额精度治理（PRD §7.4.5 阶段四：对账）— 金额 Float ↔ *Fen 影子列对账脚本。
 *
 * 不变量：每个遗留 Float（元）字段应满足  storedFen == round(float * 100)。
 * 本脚本扫描全部 10 张含 *Fen 列的模型，逐行比对，输出可读报告 + 可选 JSON。
 *
 * 运行：
 *   npm run db:reconcile                # dry-run（只读，exit 1 若有漂移）
 *   npm run db:reconcile:fix            # 修正 missing/value（Fen=round(float*100)）
 *   npx tsx scripts/reconcile-money-fen.ts --model OrderHeader --fix
 *   npx tsx scripts/reconcile-money-fen.ts --json out.json
 *
 * 维度覆盖（PRD §7.4.5 日/周/月/商家/活动/订单/退款/核销）：
 *   行级 Float↔Fen 一致是聚合一致（任意维度求和 0 分差）的充要条件，故行级对账即满足「差异为 0 分」。
 *
 * 注意：脚本需用绝对 DATABASE_URL（相对路径会被 Prisma 按 schema 目录解析而打不开 dev.db）。
 */
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { MONEY_FIELDS } from '../packages/shared/src/money-fen';
import { reconcileRow, summarizeMismatches, type FenMismatch } from '../packages/shared/src/money-reconcile';

/**
 * 解析数据库 URL：.env 中的 DATABASE_URL 常为相对路径（file:./prisma/dev.db），
 * 裸脚本里 Prisma 会按 schema 目录解析而打不开 dev.db（已知坑）。这里始终解析为绝对路径；
 * 仅当用户显式给出绝对路径时才原样采用。
 */
function resolveDbUrl(): string {
  const env = process.env.DATABASE_URL;
  if (!env) return 'file:' + path.resolve(__dirname, '../prisma/dev.db');
  const stripped = env.replace(/^file:/, '');
  // 已是绝对路径（Unix / 开头、Windows 盘符、file:///abs）则原样返回
  if (/^(\/|[A-Za-z]:[\\/])/.test(stripped)) return env;
  // 相对路径：相对仓库根解析
  return 'file:' + path.resolve(__dirname, '..', stripped);
}

const DB_URL = resolveDbUrl();
const prisma = new PrismaClient({
  datasources: { db: { url: DB_URL } }
});

interface Flags {
  fix: boolean;
  model?: string;
  json?: string;
  chunk: number;
  detail: number;
}

function parseFlags(argv: string[]): Flags {
  const f: Flags = { fix: false, chunk: 5000, detail: 50 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fix') f.fix = true;
    else if (a === '--model') f.model = argv[++i];
    else if (a === '--json') f.json = argv[++i];
    else if (a === '--chunk') f.chunk = Math.max(100, Number(argv[++i]) || 5000);
    else if (a === '--detail') f.detail = Number(argv[++i]) || 50;
  }
  return f;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const models = flags.model ? [flags.model] : Object.keys(MONEY_FIELDS);
  // 仅保留 MONEY_FIELDS 中真实存在的模型
  const validModels = models.filter((m) => MONEY_FIELDS[m]);
  if (validModels.length === 0) {
    console.error(`❌ 未找到模型：${models.join(', ')}（可用：${Object.keys(MONEY_FIELDS).join(', ')}）`);
    process.exit(2);
  }

  const allMismatches: FenMismatch[] = [];
  let rowsScanned = 0;
  let fixedCount = 0;
  const fixErrors: string[] = [];

  console.log(`[reconcile] Phase 4 金额精度对账（Float ↔ *Fen）`);
  console.log(`[reconcile] 模式: ${flags.fix ? '修正(--fix)' : 'dry-run(只读)'}`);
  console.log(`[reconcile] 数据库: ${DB_URL}`);
  console.log(`[reconcile] 模型: ${validModels.length}/${Object.keys(MONEY_FIELDS).length}`);
  console.log('');

  for (const model of validModels) {
    const map = MONEY_FIELDS[model];
    const cols = ['"_rid"', ...Object.keys(map).map((c) => `"${c}"`), ...Object.values(map).map((c) => `"${c}"`)];
    const colSql = cols.join(', ');
    let lastRid = 0;
    let batch: Record<string, unknown>[] = [];
    let modelRows = 0;
    let modelMismatch = 0;

    do {
      batch = (await prisma.$queryRawUnsafe(
        `SELECT rowid AS "_rid", ${colSql} FROM "${model}" WHERE rowid > ? ORDER BY rowid LIMIT ?`,
        lastRid,
        flags.chunk
      )) as Record<string, unknown>[];

      for (const row of batch) {
        const rid = row['_rid'];
        const rowId = rid === undefined || rid === null ? modelRows : rid;
        modelRows += 1;
        rowsScanned += 1;
        const mis = reconcileRow(model, row, rowId);
        if (mis.length) {
          modelMismatch += mis.length;
          allMismatches.push(...mis);

          if (flags.fix) {
            for (const m of mis) {
              if ((m.kind === 'missing' || m.kind === 'value') && m.computedFen !== null) {
                try {
                  await prisma.$executeRawUnsafe(
                    `UPDATE "${model}" SET "${m.fenField}" = ? WHERE rowid = ?`,
                    m.computedFen,
                    rid
                  );
                  fixedCount += 1;
                } catch (err) {
                  fixErrors.push(`${model} rowid=${rid} ${m.fenField}: ${(err as Error).message}`);
                }
              }
            }
          }
        }
      }
      if (batch.length) lastRid = Number(batch[batch.length - 1]['_rid']);
    } while (batch.length === flags.chunk);

    if (modelMismatch > 0) {
      console.log(`  ⚠ ${model}: 扫描 ${modelRows} 行, 不一致 ${modelMismatch}`);
    } else {
      console.log(`  ✓ ${model}: 扫描 ${modelRows} 行, 一致`);
    }
  }

  const summary = { rowsScanned, ...summarizeMismatches(allMismatches) };

  console.log('');
  console.log('──────── 对账汇总 ────────');
  console.log(`  扫描行数:   ${summary.rowsScanned}`);
  console.log(`  不一致总数: ${summary.mismatches}`);
  console.log(
    `  按类型:     missing=${summary.byKind.missing} value=${summary.byKind.value} orphan=${summary.byKind.orphan}`
  );
  if (Object.keys(summary.byField).length) {
    console.log('  按字段(前15):');
    for (const [k, v] of Object.entries(summary.byField).slice(0, 15)) {
      console.log(`    ${k}: ${v}`);
    }
  }
  if (flags.fix) {
    console.log(`  已修正:     ${fixedCount} 处`);
    if (fixErrors.length) console.log(`  修正失败:   ${fixErrors.length} 处（见日志尾）`);
  } else if (summary.mismatches > 0) {
    console.log('  ℹ dry-run 未修正。加 --fix 可自动将 missing/value 的 Fen 置为 round(float*100)。');
  }

  // 详情样例
  if (allMismatches.length) {
    console.log('');
    console.log(`──────── 不一致样例（最多 ${flags.detail}） ────────`);
    for (const m of allMismatches.slice(0, flags.detail)) {
      const floatStr = m.floatValue === null ? 'null' : String(m.floatValue);
      const storedStr = m.storedFen === null ? 'null' : m.storedFen.toString();
      const compStr = m.computedFen === null ? 'null' : m.computedFen.toString();
      console.log(
        `  ${m.model} rowid=${m.rowId} ${m.floatField}: float=${floatStr} computedFen=${compStr} storedFen=${storedStr} [${m.kind}]`
      );
    }
  }

  if (flags.json) {
    const fs = await import('node:fs');
    const payload = {
      generatedAt: new Date().toISOString(),
      mode: flags.fix ? 'fix' : 'dry-run',
      summary,
      fixedCount: flags.fix ? fixedCount : undefined,
      fixErrors: flags.fix ? fixErrors : undefined,
      // 截断超长明细，避免文件过大
      mismatches: allMismatches.slice(0, 2000)
    };
    fs.writeFileSync(flags.json, JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
    console.log(`\n[reconcile] JSON 报告已写入 ${flags.json}`);
  }

  if (fixErrors.length) {
    console.log('\n──────── 修正失败明细 ────────');
    for (const e of fixErrors.slice(0, 30)) console.log(`  ${e}`);
  }

  // 退出码：dry-run 且有漂移 → 1（CI 门禁：金额对账差异为 0）；fix 模式修正后 → 0
  const exitCode = !flags.fix && summary.mismatches > 0 ? 1 : 0;
  if (summary.mismatches > 0) {
    console.log(`\n[reconcile] 存在 ${summary.mismatches} 处不一致，退出码 ${exitCode}`);
  } else {
    console.log('\n[reconcile] ✓ 全部一致，差异为 0 分');
  }
  process.exitCode = exitCode;
}

main()
  .catch((e) => {
    console.error('[reconcile] 致命错误:', e);
    process.exitCode = 3;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
