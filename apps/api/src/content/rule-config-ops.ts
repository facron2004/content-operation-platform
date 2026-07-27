import { Prisma } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import type { Logger } from '@nestjs/common';
import type { RuleConfig, RuleConfigPayload, RuleType } from '@content/shared';
import { resolvePagination } from '@content/shared';
import {
  mapPool,
  QUERY_IN_CHUNKS_CONCURRENCY,
  RULE_CONFIG_INACTIVE_KEEP
} from '../common/sql-chunk';
import { mergeRuleConfig } from '../domain/rules-defaults';
import type { PrismaService } from '../prisma/prisma.service';
import type { TypedRuleConfig } from './rule-config.service';
import {
  type CacheEntry,
  RULE_CONFIG_ACTIVE_SELECT,
  RULE_CONFIG_LIST_SELECT,
  mapRuleConfig,
  validatePayload,
  safeParsePayload,
  ruleCacheKey,
  getRuleCacheEntry,
  setRuleCacheEntry,
  invalidateRuleCache
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
  // Prior Promise.all batches of 16 pin SQLite under cold multi-merchant storms.
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
    ]),
    p = resolvePagination(query.page, query.pageSize, total);
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

export async function createRuleVersion(
  prisma: PrismaService,
  dto: {
    merchantId?: string;
    type: RuleType;
    name: string;
    payload: RuleConfigPayload;
    comment?: string;
    createdBy?: string;
  }
): Promise<{ row: RuleConfig; scopeMerchant: string | null }> {
  validatePayload(dto.type, dto.payload);
  const scopeMerchant = dto.merchantId && dto.merchantId.length > 0 ? dto.merchantId : null;
  // Phantom merchantId would create orphan rule rows that never match real merchants.
  if (scopeMerchant) {
    const merchants = await prisma.$queryRawUnsafe<Array<{ merchantId: string }>>(
      `SELECT "merchantId" FROM "Merchant" WHERE "merchantId" = ? LIMIT 1`,
      scopeMerchant
    );
    if (!merchants.length) {
      throw new NotFoundException(`商家不存在: ${scopeMerchant}`);
    }
  }
  const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Only need the max version — take newest few rows instead of full history.
    const existing = await tx.ruleConfig.findMany({
      where: { tenantId: null, merchantId: scopeMerchant, type: dto.type },
      select: { version: true },
      orderBy: { version: 'desc' },
      take: 1
    });
    const maxVersion = existing[0]?.version ?? 0;
    // Residual #150: create returns list projection — SPA reloads list and
    // discards body; free-form payload is not needed on the response.
    const row = await tx.ruleConfig.create({
      data: {
        tenantId: null,
        merchantId: scopeMerchant,
        type: dto.type,
        name: dto.name,
        version: maxVersion + 1,
        isActive: false,
        payload: JSON.stringify(dto.payload),
        comment: dto.comment ?? null,
        createdBy: dto.createdBy ?? null
      },
      select: RULE_CONFIG_LIST_SELECT
    });
    // Prune oldest inactive versions beyond keep-N — active always retained.
    await pruneInactiveRuleVersions(tx, scopeMerchant, dto.type);
    return row;
  });
  return { row: mapRuleConfig(created), scopeMerchant };
}

/**
 * Keep at most RULE_CONFIG_INACTIVE_KEEP inactive versions per (merchantId, type).
 * Active row is never deleted. Excess oldest inactive pruned by version ASC.
 */
async function pruneInactiveRuleVersions(
  tx: Prisma.TransactionClient,
  merchantId: string | null,
  type: RuleType
): Promise<void> {
  const keep = Math.max(1, RULE_CONFIG_INACTIVE_KEEP);
  // Skip the newest `keep` versions; only materialize excess ids (bounded).
  // Cap delete batch so a runaway history cannot load tens of thousands of ids.
  const PRUNE_BATCH = 200;
  const excess = await tx.ruleConfig.findMany({
    where: { tenantId: null, merchantId, type, isActive: false },
    select: { id: true },
    orderBy: { version: 'desc' },
    skip: keep,
    take: PRUNE_BATCH
  });
  if (excess.length === 0) return;
  await tx.ruleConfig.deleteMany({
    where: { id: { in: excess.map((r) => r.id) }, isActive: false }
  });
}

export async function activateRuleVersion(
  prisma: PrismaService,
  id: string
): Promise<{ row: RuleConfig; merchantId: string | null; type: RuleType }> {
  // Re-read the target inside the transaction so concurrent delete/activate
  // cannot deactivate the wrong (merchantId,type) cohort from a stale pre-read.
  // Residual #126: cohort pin only needs tenantId/merchantId/type — skip payload blob.
  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.ruleConfig.findUnique({
      where: { id },
      select: { tenantId: true, merchantId: true, type: true }
    });
    if (!existing) throw new Error(`规则配置不存在: ${id}`);
    await tx.ruleConfig.updateMany({
      where: {
        tenantId: existing.tenantId,
        merchantId: existing.merchantId,
        type: existing.type,
        isActive: true
      },
      data: { isActive: false }
    });
    // Residual #150: list projection only — SPA discards body + reloads list;
    // free-form payload is not needed on the activate response.
    const row = await tx.ruleConfig.update({
      where: { id },
      data: { isActive: true },
      select: RULE_CONFIG_LIST_SELECT
    });
    return { row, merchantId: existing.merchantId, type: existing.type as RuleType };
  });
  return {
    row: mapRuleConfig(updated.row),
    merchantId: updated.merchantId,
    type: updated.type
  };
}

type CreateDto = {
  merchantId?: string;
  type: RuleType;
  name: string;
  payload: RuleConfigPayload;
  comment?: string;
  createdBy?: string;
};
export async function createRuleAndInvalidate(
  prisma: PrismaService,
  cache: Map<string, CacheEntry>,
  dto: CreateDto
): Promise<RuleConfig> {
  const { row, scopeMerchant } = await createRuleVersion(prisma, dto);
  invalidateRuleCache(cache, scopeMerchant, dto.type);
  return row;
}
export async function activateRuleAndInvalidate(
  prisma: PrismaService,
  cache: Map<string, CacheEntry>,
  id: string
): Promise<RuleConfig> {
  const { row, merchantId, type } = await activateRuleVersion(prisma, id);
  invalidateRuleCache(cache, merchantId, type);
  return row;
}
export async function deleteRuleAndInvalidate(
  prisma: PrismaService,
  cache: Map<string, CacheEntry>,
  id: string
): Promise<void> {
  // Pre-read for cache scope + existence message; pin isActive=false on DELETE so a
  // concurrent activate cannot wipe the newly live cohort between check and delete.
  // Residual #126: only merchantId/type/isActive needed — skip payload blob.
  const row = await prisma.ruleConfig.findUnique({
    where: { id },
    select: { merchantId: true, type: true, isActive: true }
  });
  if (!row) throw new Error(`规则配置不存在: ${id}`);
  if (row.isActive) {
    throw new Error('不能删除当前生效的规则配置，请先激活其他版本或新建后激活');
  }
  const result = await prisma.ruleConfig.deleteMany({
    where: { id, isActive: false }
  });
  if (result.count <= 0) {
    // Existence-only re-probe (payload not needed for the error branch).
    const latest = await prisma.ruleConfig.findUnique({
      where: { id },
      select: { id: true }
    });
    if (!latest) {
      // Already gone (concurrent delete) — still drop cache for prior scope.
      invalidateRuleCache(cache, row.merchantId, row.type as RuleType);
      return;
    }
    throw new Error('不能删除当前生效的规则配置，请先激活其他版本或新建后激活');
  }
  invalidateRuleCache(cache, row.merchantId, row.type as RuleType);
}

export async function resolveEffectiveRules<K extends RuleType>(params: {
  prisma: PrismaService;
  cache: Map<string, CacheEntry>;
  cacheTtlMs: number;
  type: K;
  merchantId?: string;
  warn: Logger['warn'];
  /** Per-key in-flight coalesce for cold multi-merchant recommend storms. */
  inFlight?: Map<string, Promise<unknown>>;
}): Promise<TypedRuleConfig[K]> {
  const key = ruleCacheKey(params.merchantId, params.type),
    cached = getRuleCacheEntry<TypedRuleConfig[K]>(params.cache, key);
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
