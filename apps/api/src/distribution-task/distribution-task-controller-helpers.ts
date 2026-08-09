import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { isHttpUrl } from '../common/http-url';
import { buildDataScope, isResourceInScope, resolveScopedQuery } from '../user-access/data-scope';
import type { PrismaService } from '../prisma/prisma.service';

export type AuthUser = {
  userId: string;
  username: string;
  roles?: string[];
  bindings?: Array<{ role: string; scopeType?: string; scopeId?: string }>;
};

export type TaskPackageGeo = {
  areaId: string | null;
  merchantId: string | null;
};

export function assertEvidenceUrl(value?: string): void {
  if (value != null && String(value).trim() !== '' && !isHttpUrl(value)) {
    throw new BadRequestException('evidenceUrl 必须是 http(s) 绝对链接');
  }
}

/**
 * Scope task routes using package geography already loaded by the task query
 * whenever possible; `undefined` keeps the package lookup fallback for detail
 * and update paths that only have a packageId.
 */
export async function assertTaskAccess(
  prisma: PrismaService,
  packageId: string,
  req: Request,
  packageGeo?: TaskPackageGeo | null
): Promise<void> {
  const actor = req.user as AuthUser | undefined;
  const scoped = resolveScopedQuery(actor ?? {}, {});
  if (scoped.emptyScope) throw new ForbiddenException('无权访问该任务');
  const scope = buildDataScope(actor ?? {});
  if (scope.unrestricted) return;

  let geo = packageGeo;
  if (geo === undefined) {
    const pkg = await prisma.contentPackage.findUnique({
      where: { packageId },
      select: { areaId: true, merchantId: true }
    });
    if (!pkg) throw new NotFoundException('任务关联套餐不存在');
    geo = { areaId: pkg.areaId, merchantId: pkg.merchantId };
  } else if (geo === null) {
    throw new NotFoundException('任务关联套餐不存在');
  }

  if (!isResourceInScope(actor ?? {}, { areaId: geo.areaId, merchantId: geo.merchantId })) {
    throw new ForbiddenException('无权访问该任务');
  }
}
