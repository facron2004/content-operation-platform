/**
 * VNext 金额展示 / 汇总工具（PRD §7.4.4 / §7.4.5）。
 *
 * 硬约束：前端禁止对金额做浮点运算。所有金额以「分」整数（后端 *Fen 字符串）
 * 或后端 *Display 字符串为准；遗留 Float 仅作迁移期兜底。
 *
 * 这里自包含实现一份整数金额逻辑，刻意不依赖 @content/shared 的 fen 工具，
 * 以避免与后端共享包的构建顺序耦合（Phase 5 已知坑：shared dist 陈旧导致 api tsc 报缺导出）。
 * 逻辑与 shared/money-fen.ts 的 fenToDisplay/sumFen 保持一致。
 */

const isBlank = (v: unknown): boolean => v === null || v === undefined || v === '';

/** 分 → "¥ 1,234.56"（纯整数运算，无浮点）。null/空 → "¥ 0.00"。 */
export function formatFenYuan(fen: bigint | number | string | null | undefined): string {
  if (isBlank(fen)) return '¥ 0.00';
  const raw = String(fen).trim();
  const neg = raw.startsWith('-');
  const digits = (neg ? raw.slice(1) : raw).replace(/[^\d]/g, '') || '0';
  const v = BigInt(digits);
  const yuan = v / 100n;
  const cents = v % 100n;
  const grouped = yuan.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}¥ ${grouped}.${cents.toString().padStart(2, '0')}`;
}

/** 后端 "39.90" / "1,234.5" → "¥ 1,234.56"（整数重排，避免浮点）。 */
function normalizeDisplay(display: string): string {
  const cleaned = display.replace(/[¥￥,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return display.startsWith('¥') ? display : `¥ ${display}`;
  }
  const neg = cleaned.startsWith('-');
  const [intPart, decPart = ''] = (neg ? cleaned.slice(1) : cleaned).split('.');
  const fen = BigInt(intPart || '0') * 100n + BigInt((decPart + '00').slice(0, 2));
  return formatFenYuan(neg ? -fen : fen);
}

/**
 * 读取记录上的金额「分」整数：优先 *Fen（后端），否则遗留 Float 换算 round(x*100)。
 * 用于求和（sumMoneyFen）与图表数值派生。result 是 bigint 或 null。
 */
export function readFen(record: unknown, field: string): bigint | null {
  const r = (record ?? {}) as Record<string, unknown>;
  const fen = r[`${field}Fen`];
  if (!isBlank(fen)) {
    const digits = String(fen).replace(/[^\d-]/g, '');
    if (digits && digits !== '-') return BigInt(digits);
  }
  const fb = r[field];
  if (typeof fb === 'number' && Number.isFinite(fb)) return BigInt(Math.round(fb * 100));
  return null;
}

/**
 * 统一金额展示入口（PRD §7.4.4）。
 * 优先级：*Display（后端已格式化）→ *Fen（整数格式化）→ 遗留 Float 兜底。
 * record 用 unknown 兼容任意 DTO，无需逐字段改类型即可读取新字段。
 */
export function displayMoney(record: unknown, field: string): string {
  const r = (record ?? {}) as Record<string, unknown>;
  const fen = r[`${field}Fen`];
  if (!isBlank(fen)) return formatFenYuan(fen as bigint | number | string);
  const display = r[`${field}Display`];
  if (!isBlank(display)) return normalizeDisplay(String(display));
  return legacyGmv(r[field]);
}

/** 分整数求和，返回 bigint（替代前端浮点 reduce 累加；用于 GMV / 退款等汇总）。 */
export function sumMoneyFen(rows: Array<unknown>, field: string): bigint {
  let total = 0n;
  for (const row of rows) {
    const f = readFen(row, field);
    if (f !== null) total += f;
  }
  return total;
}

/** 分整数求和 → "¥ x,xxx.xx"（展示用）。 */
export function sumMoney(rows: Array<unknown>, field: string): string {
  return formatFenYuan(sumMoneyFen(rows, field));
}

/** 兼容旧实现的金额展示（遗留 Float 兜底）。 */
function legacyGmv(value: unknown): string {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : null;
  if (n === null) return '—';
  const s = n.toLocaleString('zh-CN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  return `¥ ${s}`;
}
