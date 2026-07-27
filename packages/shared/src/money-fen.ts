/**
 * VNext 金额精度治理（PRD §7.4）：分整数金额工具。
 *
 * 规范：
 * - 存储/计算一律用「分」为单位的整数（SQLite INTEGER / Prisma BigInt）。
 * - API 传输：Fen 字段用字符串（防 JS 精度丢失），并同时给 Display 字段（"39.90"）。
 * - 前端禁止对金额做浮点运算，只做字符串展示。
 *
 * 迁移期间（阶段二~五）Float 旧字段与 *Fen 新字段并存：
 * - 写路径：双写（yuanToFen 转换后写入 *Fen）。
 * - 读路径：*Fen 非空优先，否则回退 Float×100（round）。
 */

/** 分 → 元展示字符串："3990" | 3990n | 3990 → "39.90"；null/undefined → "0.00" */
export function fenToDisplay(fen: bigint | number | string | null | undefined): string {
  if (fen === null || fen === undefined || fen === '') return '0.00';
  const v = typeof fen === 'bigint' ? fen : BigInt(String(fen).trim());
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const yuan = abs / 100n;
  const cents = abs % 100n;
  return `${neg ? '-' : ''}${yuan}.${cents.toString().padStart(2, '0')}`;
}

/** 元（Float，遗留字段）→ 分整数：round(yuan*100)。非法输入返回 null。 */
export function yuanToFen(yuan: number | null | undefined): bigint | null {
  if (yuan === null || yuan === undefined || Number.isNaN(yuan) || !Number.isFinite(yuan)) {
    return null;
  }
  const fen = Math.round(yuan * 100);
  if (!Number.isSafeInteger(fen)) return null;
  return BigInt(fen);
}

/** 用户输入的金额字符串（"39.90" / "39" / "-2.5"）→ 分整数。非法返回 null，不吞误差。 */
export function parseYuanStringToFen(input: string | null | undefined): bigint | null {
  if (input === null || input === undefined) return null;
  const s = input.trim().replace(/[¥￥,\s]/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  const neg = s.startsWith('-');
  const [intPart, decPart = ''] = (neg ? s.slice(1) : s).split('.');
  const fen = BigInt(intPart) * 100n + BigInt(decPart.padEnd(2, '0') || '0');
  return neg ? -fen : fen;
}

/** API 序列化：BigInt 分 → 字符串（JSON 不支持 BigInt；超安全整数场景防精度丢失） */
export function fenToApiString(fen: bigint | number | null | undefined): string {
  if (fen === null || fen === undefined) return '0';
  return String(fen);
}

/**
 * 迁移期读取优先级：*Fen 非空优先，否则回退 Float 换算。
 * 阶段五（切换读取）后 fallbackYuan 应永不生效。
 */
export function readFenWithFallback(
  fen: bigint | number | string | null | undefined,
  fallbackYuan: number | null | undefined
): bigint {
  if (fen !== null && fen !== undefined && fen !== '') {
    return typeof fen === 'bigint' ? fen : BigInt(String(fen));
  }
  return yuanToFen(fallbackYuan) ?? 0n;
}

/** 分整数求和（BigInt 安全，null 视为 0） */
export function sumFen(values: Array<bigint | number | string | null | undefined>): bigint {
  let total = 0n;
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    total += typeof v === 'bigint' ? v : BigInt(String(v));
  }
  return total;
}

/** API 响应对：{ paidAmountFen: "3990", paidAmountDisplay: "39.90" }（PRD §7.4.4） */
export function toMoneyPair(fen: bigint | number | string | null | undefined): {
  fen: string;
  display: string;
} {
  const v =
    fen === null || fen === undefined || fen === ''
      ? 0n
      : typeof fen === 'bigint'
        ? fen
        : BigInt(String(fen));
  return { fen: String(v), display: fenToDisplay(v) };
}
