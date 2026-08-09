import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RuleConfig, RuleConfigPayload, RuleType } from '@content/shared';
import { RULE_CONFIG_INACTIVE_KEEP } from '../common/sql-chunk';
import type { PrismaService } from '../prisma/prisma.service';
import {
  type CacheEntry,
  RULE_CONFIG_LIST_SELECT,
  mapRuleConfig,
  validatePayload,
  invalidateRuleCache
} from './rule-config-support';

type CreateDto = {
  merchantId?: string;
  type: RuleType;
  name: string;
  payload: RuleConfigPayload;
  comment?: string;
  createdBy?: string;
};

export async function createRuleVersion(
  prisma: PrismaService,
  dto: CreateDto
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
    await pruneInactiveRuleVersions(tx, scopeMerchant, dto.type);
    return row;
  });
  return { row: mapRuleConfig(created), scopeMerchant };
}

/** Keep at most RULE_CONFIG_INACTIVE_KEEP inactive versions per (merchantId, type). */
async function pruneInactiveRuleVersions(
  tx: Prisma.TransactionClient,
  merchantId: string | null,
  type: RuleType
): Promise<void> {
  const keep = Math.max(1, RULE_CONFIG_INACTIVE_KEEP);
  // Skip the newest `keep` versions; only materialize excess ids (bounded).
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
    // Residual #150: list projection only — SPA discards body + reloads list.
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
    const latest = await prisma.ruleConfig.findUnique({
      where: { id },
      select: { id: true }
    });
    if (!latest) {
      invalidateRuleCache(cache, row.merchantId, row.type as RuleType);
      return;
    }
    throw new Error('不能删除当前生效的规则配置，请先激活其他版本或新建后激活');
  }
  invalidateRuleCache(cache, row.merchantId, row.type as RuleType);
}
