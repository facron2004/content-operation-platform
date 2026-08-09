import { Prisma } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import type { RuleConfig, RuleType } from '@content/shared';
import { resolvePagination } from '@content/shared';
import { mapPool, QUERY_IN_CHUNKS_CONCURRENCY } from '../common/sql-chunk';
import { mergeRuleConfig } from '../domain/rules-defaults';
import type { PrismaService } from '../prisma/prisma.service';
import type { TypedRuleConfig } from './rule-config.service';
import {
  type CacheEntry,
  RULE_CONFIG_ACTIVE_SELECT,
  RULE_CONFIG_LIST_SELECT,
  mapRuleConfig,
  safeParsePayload,
  ruleCacheKey,
  getRuleCacheEntry,
  setRuleCacheEntry
} from './rule-config-support';

export async function findActiveRuleRow(
  prisma: PrismaService,
  merchantId: string | undefined,
  type: RuleType
): Promise<{ payload: string; version: number } | null> {
  // Explicit select — payload is the only free-form blob resolve needs.
  if (merchantId) {
    const merchant = await prisma.ruleConfig.findFirst({
      where: { merchantId, type, isActive: true },
      orderBy: { version: 'desc' },
      select: RULE_CONFIG_ACTIVE_SELECT
    });
    if (merchant) return merchant;
  }
  return prisma.ruleConfig.findFirst({
    where: { merchantId: null, type, isActive: true },
    orderBy: { version: 'desc' },
    select: RULE_CONFIG_ACTIVE_SELECT
  });
}

export async function loadEffectiveRulesForMerchants<K extends RuleType>(
  merchantIds: string[],
  loadOne: (type: K, merchantId: string) => Promise<TypedRuleConfig[K]>,
  type: K
): Promise<Map<string, TypedRuleConfig[K]>> {
  const result = new Map<string, TypedRuleConfig[K]>();
  const unique = [...new Set(merchantIds)];
  // Bound fan-out to SQLite pool norm (parity with queryInChunks / data-analysis).
  await mapPool(unique, QUERY_IN_CHUNKS_CONCURRENCY, async (id) => {
    result.set(id, await loadOne(type, id));
  });
  return result;
}

export async function listRuleConfigs(
  prisma: PrismaService,
  query: {
    merchantId?: string;
    type?: RuleType;
    isActive?: boolean;
    page?: number;
    pageSize?: number;
  }
): Promise<{
  items: RuleConfig[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const where: Prisma.RuleConfigWhereInput = {};
  if (query.merchantId !== undefined) where.merchantId = query.merchantId;
  if (query.type !== undefined) where.type = query.type;
  if (query.isActive !== undefined) where.isActive = query.isActive;
  const resolved = resolvePagination(query.page, query.pageSize, 0);
  const [rows, total] = await Promise.all([
    prisma.ruleConfig.findMany({
      where,
      orderBy: [{ type: 'asc' }, { merchantId: 'asc' }, { version: 'desc' }],
      skip: resolved.offset,
      take: resolved.pageSize,
      // List omits payload JSON — detail/activate/edit use getRuleConfigById.
      select: RULE_CONFIG_LIST_SELECT
    }),
    prisma.ruleConfig.count({ where })
  ]);
  const p = resolvePagination(query.page, query.pageSize, total);
  return {
    items: rows.map(mapRuleConfig),
    pagination: { page: p.page, pageSize: p.pageSize, total, totalPages: p.totalPages }
  };
}

export async function getRuleConfigById(prisma: PrismaService, id: string): Promise<RuleConfig> {
  const row = await prisma.ruleConfig.findUnique({ where: { id } });
  if (!row) throw new NotFoundException(`规则配置不存在: ${id}`);
  return mapRuleConfig(row);
}

export async function resolveEffectiveRules<K extends RuleType>(params: {
  prisma: PrismaService;
  cache: Map<string, CacheEntry>;
  cacheTtlMs: number;
  type: K;
  merchantId?: string;
  warn: (message: string) => void;
  /** Per-key in-flight coalesce for cold multi-merchant recommend storms. */
  inFlight?: Map<string, Promise<unknown>>;
}): Promise<TypedRuleConfig[K]> {
  const key = ruleCacheKey(params.merchantId, params.type);
  const cached = getRuleCacheEntry<TypedRuleConfig[K]>(params.cache, key);
  if (cached) return cached;
  const pending = params.inFlight?.get(key) as Promise<TypedRuleConfig[K]> | undefined;
  if (pending) return pending;

  const loadPromise = (async () => {
    const row = await findActiveRuleRow(params.prisma, params.merchantId, params.type);
    const payload = row
      ? safeParsePayload(row.payload, (msg) =>
          params.warn(`规则 payload 解析失败,回退默认: ${msg}`)
        )
      : null;
    const merged = mergeRuleConfig(params.type, payload) as TypedRuleConfig[K];
    setRuleCacheEntry(params.cache, key, merged, params.cacheTtlMs);
    return merged;
  })();

  if (params.inFlight) {
    params.inFlight.set(key, loadPromise);
    try {
      return await loadPromise;
    } finally {
      if (params.inFlight.get(key) === loadPromise) params.inFlight.delete(key);
    }
  }
  return loadPromise;
}
