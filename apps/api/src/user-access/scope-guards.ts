import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { PrismaService } from '../prisma/prisma.service';
import { safePathId } from '../common/path-id';
import { isResourceInScope, resolveScopedQuery } from './data-scope';

type AuthUser = {
  userId?: string;
  username?: string;
  roles?: string[];
  bindings?: Array<{ role: string; scopeType?: string; scopeId?: string }>;
};

/** Deny package detail/timeline IDOR for scoped roles. */
export async function assertPackageInScope(
  prisma: PrismaService,
  packageId: string,
  req: Request
): Promise<void> {
  // Cap path ids before SQL / error text — unbounded params waste work and pollute logs.
  const id = safePathId(packageId);
  if (!id) throw new NotFoundException('套餐不存在');
  await assertPackagesInScope(prisma, [id], req);
}

/**
 * Batch package scope check — one IN query for up to 200 ids (alert resolve-batch).
 * Unrestricted actors short-circuit; missing/out-of-scope ids fail closed.
 */
export async function assertPackagesInScope(
  prisma: PrismaService,
  packageIds: readonly string[],
  req: Request
): Promise<void> {
  const ids = [
    ...new Set(
      packageIds.map((p) => safePathId(String(p ?? ''))).filter((id): id is string => Boolean(id))
    )
  ].slice(0, 200);
  if (!ids.length) return;

  const actor = (req.user as AuthUser | undefined) ?? {};
  const scoped = resolveScopedQuery(actor, {});
  if (scoped.emptyScope) throw new ForbiddenException('无权访问该套餐');
  // Unrestricted (admin/platform) — no package row lookups.
  if (
    !scoped.areaId &&
    !scoped.merchantId &&
    !scoped.areaIds?.length &&
    !scoped.merchantIds?.length
  ) {
    return;
  }

  const ph = ids.map(() => '?').join(',');
  const rows = await prisma.$queryRawUnsafe<
    Array<{ packageId: string; areaId: string | null; merchantId: string | null }>
  >(
    `SELECT "packageId", "areaId", "merchantId" FROM "ContentPackage" WHERE "packageId" IN (${ph})`,
    ...ids
  );
  const byId = new Map(rows.map((r) => [r.packageId, r]));
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) throw new NotFoundException(`套餐不存在: ${id}`);
    if (!isResourceInScope(actor, row)) {
      throw new ForbiddenException('无权访问该套餐');
    }
  }
}

/**
 * Platform-wide aggregate dashboards (GMV/refund/overview/merchant-sales)
 * are unrestricted-only. Scoped roles use merchant/package detail endpoints.
 */
export function assertUnrestrictedAnalytics(req: Request): void {
  const actor = (req.user as AuthUser | undefined) ?? {};
  const scoped = resolveScopedQuery(actor, {});
  if (scoped.emptyScope) {
    throw new ForbiddenException('无权查看平台汇总数据');
  }
  // empty single/multi scope means unrestricted (admin/platform_operator/auditor)
  const hasScope =
    Boolean(scoped.areaId) ||
    Boolean(scoped.merchantId) ||
    Boolean(scoped.areaIds?.length) ||
    Boolean(scoped.merchantIds?.length);
  if (hasScope) {
    throw new ForbiddenException('无权查看平台汇总数据');
  }
}
