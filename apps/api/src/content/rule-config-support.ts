import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RuleConfig, RuleConfigPayload, RuleType } from '@content/shared';
import { RULE_TYPES, isRecord } from '@content/shared';
import { RULE_CONFIG_CACHE_MAX } from '../common/sql-chunk';
import {
  DEFAULT_COPY_RULES,
  DEFAULT_INVENTORY_RULES,
  DEFAULT_PROMOTION_RULES,
  DEFAULT_RULES
} from '../domain/rules-defaults';

export interface CacheEntry {
  data: unknown;
  expiresAt: number;
}
export function ruleCacheKey(merchantId: string | null | undefined, type: RuleType): string {
  return `m:${merchantId ?? '*'}|t:${type}`;
}
export function getRuleCacheEntry<T>(cache: Map<string, CacheEntry>, key: string): T | undefined {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    // Refresh insertion order so hot keys survive FIFO prune.
    cache.delete(key);
    cache.set(key, entry);
    return entry.data as T;
  }
  cache.delete(key);
  return undefined;
}
export function setRuleCacheEntry(
  cache: Map<string, CacheEntry>,
  key: string,
  data: unknown,
  ttlMs: number
): void {
  // Delete first so re-set moves the key to the Map's insertion tail (LRU-ish).
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  // Bound high-cardinality merchant×type keys — unbounded Map grows with every
  // unique merchant that hits recommendations / rule resolve.
  const max = Math.max(1, RULE_CONFIG_CACHE_MAX);
  while (cache.size > max) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}
export function invalidateRuleCache(
  cache: Map<string, CacheEntry>,
  merchantId?: string | null,
  type?: RuleType
): void {
  if (merchantId === undefined && type === undefined) {
    cache.clear();
    return;
  }
  for (const key of [...cache.keys()]) {
    const matchMerchant =
        merchantId === undefined || merchantId === null || key.includes(`m:${merchantId}|`),
      matchType = type === undefined || key.includes(`|t:${type}`);
    if (matchMerchant && matchType) cache.delete(key);
  }
}

export function rethrowMissingRule(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  if (message.startsWith('规则配置不存在:')) throw new NotFoundException(message);
  if (message.startsWith('不能删除当前生效的规则配置')) throw new BadRequestException(message);
  throw err;
}

export function ruleConfigDefaults(): Record<RuleType, unknown> {
  return {
    promotion: DEFAULT_PROMOTION_RULES,
    copy: DEFAULT_COPY_RULES,
    inventory: DEFAULT_INVENTORY_RULES,
    alert: DEFAULT_RULES.alert
  };
}

function assertBaseItem(item: unknown, i: number, prevMax?: number): number {
  if (!isRecord(item))
    throw new BadRequestException(`promotion.baseScoreByStockRatio[${i}] 必须是对象`);
  const { maxRatio, score } = item as { maxRatio: unknown; score: unknown };
  if (typeof maxRatio !== 'number' || !Number.isFinite(maxRatio))
    throw new BadRequestException(`promotion.baseScoreByStockRatio[${i}].maxRatio 必须是有效数字`);
  if (maxRatio < 0 || maxRatio > 1)
    throw new BadRequestException(`promotion.baseScoreByStockRatio[${i}].maxRatio 必须在 0~1 之间`);
  if (typeof score !== 'number' || !Number.isFinite(score))
    throw new BadRequestException(`promotion.baseScoreByStockRatio[${i}].score 必须是有效数字`);
  if (score < 0 || score > 100)
    throw new BadRequestException(`promotion.baseScoreByStockRatio[${i}].score 必须在 0~100 之间`);
  if (prevMax !== undefined && maxRatio < prevMax)
    throw new BadRequestException(
      `promotion.baseScoreByStockRatio 必须按 maxRatio 升序排列,第 ${i} 项小于第 ${i - 1} 项`
    );
  return maxRatio;
}
export function validatePromotionBaseScore(payload: RuleConfigPayload): void {
  const base = payload.baseScoreByStockRatio;
  if (base === undefined) return;
  if (!Array.isArray(base))
    throw new BadRequestException('promotion.baseScoreByStockRatio 必须是数组');
  let prev: number | undefined;
  for (let i = 0; i < base.length; i++) prev = assertBaseItem(base[i], i, prev);
  if (base.length > 0 && (base[base.length - 1] as { maxRatio: number }).maxRatio < 1)
    throw new BadRequestException(
      'promotion.baseScoreByStockRatio 最后一项的 maxRatio 必须为 1(兜底)'
    );
}

export function validatePromotionStatusDelta(payload: RuleConfigPayload): void {
  const statusDelta = payload.statusScoreDelta;
  if (statusDelta === undefined) return;
  if (!isRecord(statusDelta))
    throw new BadRequestException('promotion.statusScoreDelta 必须是对象');
  for (const [k, v] of Object.entries(statusDelta)) {
    if (typeof v !== 'number' || !Number.isFinite(v))
      throw new BadRequestException(`promotion.statusScoreDelta.${k} 必须是有效数字`);
  }
}

export function validateInventoryPayload(payload: RuleConfigPayload): void {
  const requiredDays = ['stale7Days', 'stale15Days', 'stale30Days', 'stale60Days'] as const,
    dayValues: Record<string, number> = {};
  for (const key of requiredDays) {
    const val = payload[key];
    if (val === undefined) continue;
    if (typeof val !== 'number' || !Number.isFinite(val) || val < 1)
      throw new BadRequestException(`inventory.${key} 必须是 >= 1 的有效数字`);
    dayValues[key] = val;
  }
  if (Object.keys(dayValues).length >= 2) {
    const keys = requiredDays.filter((k) => k in dayValues);
    for (let i = 1; i < keys.length; i++)
      if (dayValues[keys[i]] <= dayValues[keys[i - 1]])
        throw new BadRequestException(
          `inventory 滞销天数阈值必须递增: ${keys[i - 1]}(${dayValues[keys[i - 1]]}) >= ${keys[i]}(${dayValues[keys[i]]})`
        );
  }
  const bad = (v: unknown) => v !== undefined && (typeof v !== 'number' || !Number.isFinite(v));
  if (bad(payload.backlogDays))
    throw new BadRequestException('inventory.backlogDays 必须是有效数字');
  if (bad(payload.slowDays)) throw new BadRequestException('inventory.slowDays 必须是有效数字');
}

const LEVELS = [
  { key: 's', label: 'S 级' },
  { key: 'a', label: 'A 级' },
  { key: 'b', label: 'B 级' },
  { key: 'c', label: 'C 级' }
] as const;
export function validatePromotionScoreLevel(payload: RuleConfigPayload): void {
  const scoreLevel = payload.scoreLevel as Record<string, unknown> | undefined;
  if (scoreLevel === undefined) return;
  if (!isRecord(scoreLevel)) throw new BadRequestException('promotion.scoreLevel 必须是对象');
  const values: Record<string, number> = {};
  for (const { key, label } of LEVELS) {
    if (typeof scoreLevel[key] !== 'number' || !Number.isFinite(scoreLevel[key] as number))
      throw new BadRequestException(`promotion.scoreLevel.${key} (${label}) 必须是有效数字`);
    values[key] = scoreLevel[key] as number;
  }
  if (!(values.s >= values.a && values.a >= values.b && values.b >= values.c))
    throw new BadRequestException('promotion.scoreLevel 必须满足 s >= a >= b >= c');
}
export function validatePromotionPayload(payload: RuleConfigPayload): void {
  validatePromotionScoreLevel(payload);
  validatePromotionBaseScore(payload);
  validatePromotionStatusDelta(payload);
}
export function validateCopyPayload(payload: RuleConfigPayload): void {
  const words = payload.forbiddenWords;
  if (words === undefined) return;
  if (!Array.isArray(words)) throw new BadRequestException('copy.forbiddenWords 必须是数组');
  for (let i = 0; i < words.length; i++) {
    if (typeof words[i] !== 'string' || words[i].trim().length === 0)
      throw new BadRequestException(`copy.forbiddenWords[${i}] 必须是非空字符串`);
  }
}

/** Cap serialized rule payload so free-form JSON cannot fill the DB / response. */
export const RULE_PAYLOAD_MAX_BYTES = 32_768;

export function validatePayload(type: RuleType, payload: RuleConfigPayload): void {
  if (!isRecord(payload)) {
    throw new BadRequestException('payload 必须是 JSON 对象');
  }
  if (!RULE_TYPES.includes(type)) {
    throw new BadRequestException(`不支持的规则类型: ${type}`);
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    throw new BadRequestException('payload 无法序列化');
  }
  if (serialized.length > RULE_PAYLOAD_MAX_BYTES) {
    throw new BadRequestException(
      `payload 过大（${serialized.length} 字节，上限 ${RULE_PAYLOAD_MAX_BYTES}）`
    );
  }
  if (type === 'promotion') validatePromotionPayload(payload);
  else if (type === 'inventory') validateInventoryPayload(payload);
  else if (type === 'copy') validateCopyPayload(payload);
}

export type RuleConfigRow = Prisma.RuleConfigGetPayload<object>;

/** Active-resolve projection: payload + version only (resolveEffectiveRules needs nothing else). */
export const RULE_CONFIG_ACTIVE_SELECT = {
  payload: true,
  version: true
} as const;

/** List projection: omit large free-form payload JSON (detail via getRuleConfigById). */
export const RULE_CONFIG_LIST_SELECT = {
  id: true,
  tenantId: true,
  merchantId: true,
  type: true,
  name: true,
  version: true,
  isActive: true,
  comment: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true
} as const;

type RuleConfigListRow = {
  id: string;
  tenantId: string | null;
  merchantId: string | null;
  type: string;
  name: string;
  version: number;
  isActive: boolean;
  payload?: string;
  comment: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function mapRuleConfig(row: RuleConfigRow | RuleConfigListRow): RuleConfig {
  let payload: RuleConfigPayload = {};
  if (typeof row.payload === 'string' && row.payload.length > 0) {
    try {
      const parsed = JSON.parse(row.payload);
      if (isRecord(parsed)) payload = parsed;
    } catch {
      payload = {};
    }
  }
  return {
    id: row.id,
    tenantId: row.tenantId,
    merchantId: row.merchantId,
    type: row.type as RuleType,
    name: row.name,
    version: row.version,
    isActive: row.isActive,
    payload,
    comment: row.comment,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
export function safeParsePayload(
  raw: string,
  onError?: (message: string) => void
): RuleConfigPayload | null {
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch (error: unknown) {
    onError?.(error instanceof Error ? error.message : String(error));
    return null;
  }
}
