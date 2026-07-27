/**
 * VNext 金额精度治理（PRD §7.4.5 阶段四：对账）— 纯函数对账助手。
 *
 * 核心不变量（迁移期）：每个遗留 Float（元）字段应与其 *Fen（分，BigInt）影子列满足
 *   storedFen == round(float * 100)      （float 为 null 时 Fen 也应为 null）
 *
 * reconcileRow 给定一行数据，逐字段比对，返回所有不一致项，分类为：
 *  - 'missing'：Float 非 null 但 Fen 为 null（未迁移 / 回填缺口 / 双写未覆盖）
 *  - 'value'  ：Float 与 Fen 均非 null 但数值不符（双写漂移 / 手工改值 / 聚合口径不一致）
 *  - 'orphan' ：Float 为 null 但 Fen 非 null（孤儿 Fen，需人工判断，不自动修正）
 *
 * 该模块为纯函数，不依赖 Prisma / 数据库，便于单元测试与脚本复用。
 */
import { MONEY_FIELDS, yuanToFen } from './money-fen';

export type FenMismatchKind = 'missing' | 'value' | 'orphan';

export interface FenMismatch {
  /** 模型名（与 MONEY_FIELDS 键一致） */
  model: string;
  /** 行标识（调用方传入，通常为 rowid 或业务主键） */
  rowId: string | number;
  floatField: string;
  fenField: string;
  floatValue: number | null;
  /** round(float*100)，float 非法（NaN/Infinite）时为 null */
  computedFen: bigint | null;
  storedFen: bigint | null;
  kind: FenMismatchKind;
  /** 绝对分差 computed - stored（仅 value 类信息量大；missing 时为 computed，orphan 时为 -stored） */
  diff: bigint;
}

/** 将任意来源的 Fen 值规整为 bigint|null（原始 SQL 可能返回 number，ORM 返回 bigint）。 */
function toBigIntOrNull(v: unknown): bigint | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'bigint') return v;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) return null;
  return BigInt(Math.trunc(n));
}

/**
 * 对账一行：返回该行所有 Float↔Fen 不一致项（无则空数组）。
 * @param model   MONEY_FIELDS 中的模型名
 * @param row     含 Float 字段与对应 *Fen 字段的行对象
 * @param rowId   用于报告/修正的行标识（默认 '?'）
 */
export function reconcileRow(
  model: string,
  row: Record<string, unknown>,
  rowId: string | number = '?'
): FenMismatch[] {
  const map = MONEY_FIELDS[model];
  if (!map || !row || typeof row !== 'object' || Array.isArray(row)) return [];
  const out: FenMismatch[] = [];
  for (const [floatField, fenField] of Object.entries(map)) {
    const rawFloat = row[floatField];
    const rawFen = row[fenField];
    const floatValue = rawFloat === null || rawFloat === undefined ? null : Number(rawFloat);
    const storedFen = toBigIntOrNull(rawFen);
    const computedFen = yuanToFen(floatValue);

    if (floatValue !== null && storedFen === null) {
      out.push({
        model,
        rowId,
        floatField,
        fenField,
        floatValue,
        computedFen,
        storedFen,
        kind: 'missing',
        diff: computedFen ?? 0n
      });
    } else if (floatValue !== null && storedFen !== null) {
      if (computedFen !== storedFen) {
        out.push({
          model,
          rowId,
          floatField,
          fenField,
          floatValue,
          computedFen,
          storedFen,
          kind: 'value',
          diff: (computedFen ?? 0n) - storedFen
        });
      }
    } else if (floatValue === null && storedFen !== null) {
      out.push({
        model,
        rowId,
        floatField,
        fenField,
        floatValue,
        computedFen,
        storedFen,
        kind: 'orphan',
        diff: -storedFen
      });
    }
    // floatValue===null && storedFen===null → 一致，跳过
  }
  return out;
}

/** 对账汇总结构。 */
export interface ReconcileSummary {
  rowsScanned: number;
  mismatches: number;
  byKind: Record<FenMismatchKind, number>;
  byModel: Record<string, number>;
  byField: Record<string, number>;
}

/** 汇总一组不一致项（rowsScanned 由调用方累加填入）。 */
export function summarizeMismatches(mis: FenMismatch[]): Omit<ReconcileSummary, 'rowsScanned'> {
  const s: Omit<ReconcileSummary, 'rowsScanned'> = {
    mismatches: mis.length,
    byKind: { missing: 0, value: 0, orphan: 0 },
    byModel: {},
    byField: {}
  };
  for (const m of mis) {
    s.byKind[m.kind] += 1;
    s.byModel[m.model] = (s.byModel[m.model] ?? 0) + 1;
    const key = `${m.model}.${m.fenField}`;
    s.byField[key] = (s.byField[key] ?? 0) + 1;
  }
  return s;
}
