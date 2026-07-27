/**
 * VNext 金额精度治理（PRD §7.4.4 / §7.4.5 阶段五：切换读取）。
 *
 * 读路径序列化助手：把数据库实体（同时带 Float 旧字段与 *Fen BigInt 影子列）
 * 转换为 API 展示形态：
 *   - *Fen 一律转为字符串（JSON 不支持 BigInt；超安全整数场景防精度丢失）。
 *   - 追加 <floatField>Display（"39.90"），供前端直接展示，禁止前端浮点运算。
 *   - 原 Float 字段保留（迁移期新旧并存，§7.16.4）。
 *
 * 设计为「只读增强」：不删除、不修改任何既有字段，因此对现有调用方向后兼容。
 */
import { MONEY_FIELDS, fenToDisplay } from './money-fen';

/** 可参与分→元展示的源值类型（与 fenToDisplay 入参一致）。 */
type FenSource = bigint | number | string | null | undefined;

/** fen 字段名 → 对应 Float（元）字段名 的反向索引（由 MONEY_FIELDS 推导）。 */
export const MONEY_FEN_TO_FLOAT: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const map of Object.values(MONEY_FIELDS)) {
    for (const [floatField, fenField] of Object.entries(map)) {
      out[fenField] = floatField;
    }
  }
  return out;
})();

const FEN_KEYS = new Set(Object.keys(MONEY_FEN_TO_FLOAT));

/**
 * 转换单条记录：对其中出现的每个 *Fen 列，
 *   1. 值序列化为字符串（PRD §7.4.4：分用字符串传输）；
 *   2. 追加 `<floatField>Display` = fenToDisplay(fen)。
 * 原 Float 字段保持原值。无任何 money 字段时返回原引用（不拷贝）。
 */
export function toMoneyView<T extends Record<string, unknown>>(record: T): T {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  let changed = false;
  const out: Record<string, unknown> = { ...record };
  for (const key of Object.keys(record)) {
    if (!FEN_KEYS.has(key)) continue;
    const raw = (record as Record<string, unknown>)[key];
    const floatField = MONEY_FEN_TO_FLOAT[key];
    if (raw === null || raw === undefined) {
      out[key] = null;
      out[`${floatField}Display`] = '0.00';
    } else {
      // raw 可能是 bigint（Prisma 原始）或 number（经 BigIntSerializer 转换后）；统一字符串化。
      out[key] = String(raw);
      out[`${floatField}Display`] = fenToDisplay(raw as FenSource);
    }
    changed = true;
  }
  return (changed ? out : record) as T;
}

/**
 * 递归应用 toMoneyView 到任意响应体（对象 / 数组 / 嵌套结构）。
 * 先增强当前层，再递归子值；非对象原样返回。
 */
export function applyMoneyView(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => applyMoneyView(item));
  if (value && typeof value === 'object') {
    const augmented = toMoneyView(value as Record<string, unknown>);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(augmented)) {
      out[k] = applyMoneyView(v);
    }
    return out;
  }
  return value;
}
