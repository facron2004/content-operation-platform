import { Prisma } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import type { Logger } from '@nestjs/common';
import type { RuleConfig, RuleConfigPayload, RuleType } from '@content/shared';
import { resolvePagination } from '@content/shared';
import { mergeRuleConfig } from '../domain/rules-defaults';
import type { PrismaService } from '../prisma/prisma.service';
import type { TypedRuleConfig } from './rule-config.service';
import {
  type CacheEntry,
  type RuleConfigRow,
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
): Promise<RuleConfigRow | null> {
  if (merchantId) {
    const merchant = await prisma.ruleConfig.findFirst({
      where: { merchantId, type, isActive: true },
      orderBy: { version: 'desc' }
    });
    if (merchant) return merchant;
  }
  return prisma.ruleConfig.findFirst({
    where: { merchantId: null, type, isActive: true },
    orderBy: { version: 'desc' }
  });
}

export async function loadEffectiveRulesForMerchants<K extends RuleType>(
  merchantIds: string[],
  loadOne: (type: K, merchantId: string) => Promise<TypedRuleConfig[K]>,
  type: K
): Promise<Map<string, TypedRuleConfig[K]>> {
  const result = new Map<string, TypedRuleConfig[K]>();
  await Promise.all(
    [...new Set(merchantIds)].map(async (id) => {
      result.set(id, await loadOne(type, id));
    })
  );
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
        take: resolved.pageSize
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
  const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.ruleConfig.findMany({
      where: { tenantId: null, merchantId: scopeMerchant, type: dto.type },
      select: { version: true }
    });
    const maxVersion =
      existing.length > 0 ? Math.max(...existing.map((r: { version: number }) => r.version)) : 0;
    return tx.ruleConfig.create({
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
      }
    });
  });
  return { row: mapRuleConfig(created), scopeMerchant };
}

export async function activateRuleVersion(
  prisma: PrismaService,
  id: string
): Promise<{ row: RuleConfig; merchantId: string | null; type: RuleType }> {
  const existing = await prisma.ruleConfig.findUnique({ where: { id } });
  if (!existing) return Promise.reject(new Error(`规则配置不存在: ${id}`));
  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.ruleConfig.updateMany({
      where: {
        tenantId: existing.tenantId,
        merchantId: existing.merchantId,
        type: existing.type,
        isActive: true
      },
      data: { isActive: false }
    });
    return tx.ruleConfig.update({ where: { id }, data: { isActive: true } });
  });
  return {
    row: mapRuleConfig(updated),
    merchantId: existing.merchantId,
    type: existing.type as RuleType
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
  const row = await prisma.ruleConfig.findUnique({ where: { id } });
  if (!row) throw new Error(`规则配置不存在: ${id}`);
  await prisma.ruleConfig.delete({ where: { id } });
  invalidateRuleCache(cache, row.merchantId, row.type as RuleType);
}

export async function resolveEffectiveRules<K extends RuleType>(params: {
  prisma: PrismaService;
  cache: Map<string, CacheEntry>;
  cacheTtlMs: number;
  type: K;
  merchantId?: string;
  warn: Logger['warn'];
}): Promise<TypedRuleConfig[K]> {
  const key = ruleCacheKey(params.merchantId, params.type),
    cached = getRuleCacheEntry<TypedRuleConfig[K]>(params.cache, key);
  if (cached) return cached;
  const row = await findActiveRuleRow(params.prisma, params.merchantId, params.type);
  const payload = row
    ? safeParsePayload(row.payload, (msg) => params.warn(`规则 payload 解析失败,回退默认: ${msg}`))
    : null;
  const merged = mergeRuleConfig(params.type, payload) as TypedRuleConfig[K];
  setRuleCacheEntry(params.cache, key, merged, params.cacheTtlMs);
  return merged;
}
