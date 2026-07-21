export const clamp = (value: number, min = 0, max = 100): number =>
  Math.min(max, Math.max(min, value));
export const clampNonNegative = (value: number): number => Math.max(0, value);
export const safeRatio = (numerator: number, denominator: number, precision = 4): number =>
  denominator === 0 ? 0 : Number((numerator / denominator).toFixed(precision));
export const exponentialBackoff = (attempt: number, baseMs: number, maxMs: number): number =>
  Math.min(maxMs, baseMs * Math.pow(2, attempt));
export const sleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
export const randomShortId = (): string => Math.random().toString(36).slice(2, 7);
