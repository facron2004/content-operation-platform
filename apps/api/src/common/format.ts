/** 计算带 4 位精度的安全除法,分母为 0 时返回 0,避免产生 NaN。 */
export const safeRatio = (numerator: number, denominator: number, precision = 4): number =>
  denominator === 0 ? 0 : Number((numerator / denominator).toFixed(precision));

/** 当前时间的 ISO 字符串(UTC),统一封装以避免散落的 new Date().toISOString()。 */
export const nowISO = (): string => new Date().toISOString();
