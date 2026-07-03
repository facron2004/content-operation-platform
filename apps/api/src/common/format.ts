/**
 * 重新导出 shared 的 safeRatio,保持 `from '../common/format'` 的旧导入路径可用。
 * 历史调用方集中在 content/dashboard/copy-rules,统一收口到 shared 权威版本。
 */
export { safeRatio } from '@content/shared';

/** 当前时间的 ISO 字符串(UTC),统一封装以避免散落的 new Date().toISOString()。 */
export const nowISO = (): string => new Date().toISOString();

/** 从 now 起 offsetMs 之后的 ISO 字符串(UTC),用于 fallback 到期时间等场景。 */
export const futureISO = (offsetMs: number): string =>
  new Date(Date.now() + offsetMs).toISOString();

/** 毫秒时间戳 → ISO 字符串;0/负数返回 null,方便 API 层表达"从未发生"。 */
export const msToISO = (ms: number): string | null => (ms > 0 ? new Date(ms).toISOString() : null);
