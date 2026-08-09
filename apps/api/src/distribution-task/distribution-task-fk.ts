import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';

type PrismaTaskQuery = Pick<PrismaService, '$queryRawUnsafe'>;

function parseJsonStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function uniqIds(raw: Array<string | null | undefined>, max = 200): string[] {
  return [
    ...new Set(
      raw
        .map((v) => String(v ?? '').trim())
        .filter(Boolean)
        .map((v) => v.slice(0, 64))
    )
  ].slice(0, max);
}

/**
 * Batch-preload task FKs for batchCreate pre-validate (residual #86).
 * Caps at 200 distinct ids per table (batchCreate DTO max 100 rows).
 * Residual #128: empty id sets short-circuit (no SQL); single-id sets use
 * equality probes instead of IN (1) so single create/update avoids batch shape.
 */
export async function loadTaskFkBatch(
  prisma: PrismaTaskQuery,
  dtos: CreateTaskDto[]
): Promise<TaskFkMaps> {
  const packageIds = uniqIds([
    ...dtos.map((d) => d.packageId),
    ...dtos.map((d) => d.fallbackPackageId)
  ]);
  const campaignIds = uniqIds(dtos.map((d) => d.campaignId));
  const groupIds = uniqIds(dtos.map((d) => d.groupId));
  const contentIds = uniqIds(dtos.map((d) => d.contentId));
  const assigneeIds = uniqIds(dtos.map((d) => d.assigneeId));

  const packages = new Map<string, { packageId: string; areaId: string; merchantId: string }>();
  const campaigns = new Map<
    string,
    { campaignId: string; status: string; areaIds: string | null; merchantIds: string | null }
  >();
  const groups = new Map<string, { groupId: string; isActive: number; areaId: string }>();
  const contents = new Map<string, { contentId: string; packageId: string; auditStatus: string }>();
  const contentTwins = new Map<string, string>();
  const assignees = new Map<string, { userId: string; displayName: string; active: boolean }>();

  const loadIn = async <T extends Record<string, unknown>>(
    ids: string[],
    sql: string
  ): Promise<T[]> => {
    // Residual #128: empty legs never touch SQLite.
    if (!ids.length) return [];
    // Single-id equality probe — create/update typically hit 1 id per table.
    if (ids.length === 1) {
      const eqSql = sql.replace(/IN\s*\(\s*__IN__\s*\)/i, '= ?');
      return prisma.$queryRawUnsafe<T[]>(eqSql, ids[0]);
    }
    const ph = ids.map(() => '?').join(',');
    return prisma.$queryRawUnsafe<T[]>(sql.replace('__IN__', ph), ...ids);
  };

  const [pkgRows, campRows, groupRows, contentRows, twinRows, userRows] = await Promise.all([
    loadIn<{ packageId: string; areaId: string; merchantId: string }>(
      packageIds,
      `SELECT "packageId", "areaId", "merchantId" FROM "ContentPackage" WHERE "packageId" IN (__IN__)`
    ),
    loadIn<{
      campaignId: string;
      status: string;
      areaIds: string | null;
      merchantIds: string | null;
    }>(
      campaignIds,
      `SELECT "campaignId", "status", "areaIds", "merchantIds" FROM "MarketingCampaign" WHERE "campaignId" IN (__IN__)`
    ),
    loadIn<{ groupId: string; isActive: number; areaId: string }>(
      groupIds,
      `SELECT "groupId", "isActive", "areaId" FROM "CommunityGroup" WHERE "groupId" IN (__IN__)`
    ),
    loadIn<{ contentId: string; packageId: string; auditStatus: string }>(
      contentIds,
      `SELECT "contentId", "packageId", "auditStatus" FROM "GeneratedCopy" WHERE "contentId" IN (__IN__)`
    ),
    loadIn<{ contentId: string; taskId: string }>(
      contentIds,
      `SELECT "contentId", "taskId" FROM "DistributionTask"
       WHERE "contentId" IN (__IN__) AND "status" <> 'cancelled'`
    ),
    loadIn<{
      userId: string;
      displayName: string | null;
      username: string;
      isActive: number;
    }>(
      assigneeIds,
      `SELECT "userId", "displayName", "username", "isActive" FROM "AppUser" WHERE "userId" IN (__IN__)`
    )
  ]);

  for (const r of pkgRows) {
    packages.set(r.packageId, {
      packageId: r.packageId,
      areaId: String(r.areaId),
      merchantId: String(r.merchantId)
    });
  }
  for (const r of campRows) campaigns.set(r.campaignId, r);
  for (const r of groupRows) groups.set(r.groupId, r);
  for (const r of contentRows) contents.set(r.contentId, r);
  for (const r of twinRows) {
    if (!contentTwins.has(r.contentId)) contentTwins.set(r.contentId, r.taskId);
  }
  for (const r of userRows) {
    const displayName = (r.displayName && String(r.displayName).trim()) || String(r.username);
    assignees.set(r.userId, {
      userId: r.userId,
      displayName,
      active: Number(r.isActive) === 1
    });
  }

  return { packages, campaigns, groups, contents, contentTwins, assignees };
}

/**
 * Resolve one assignee for update/reassign paths that cannot reuse a batch map.
 * Keep the active-user and display-name rules identical to batchCreate.
 */
export async function resolveActiveAssignee(
  prisma: PrismaTaskQuery,
  assigneeId: string | null | undefined
): Promise<{ userId: string; displayName: string } | null> {
  if (assigneeId == null || String(assigneeId).trim() === '') return null;
  const id = String(assigneeId).trim().slice(0, 64);
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      userId: string;
      displayName: string | null;
      username: string;
      isActive: number;
    }>
  >(
    `SELECT "userId", "displayName", "username", "isActive"
     FROM "AppUser" WHERE "userId" = ?`,
    id
  );
  if (!rows.length) throw new NotFoundException(`指派用户不存在: ${id}`);
  if (Number(rows[0].isActive) !== 1) {
    throw new BadRequestException(`指派用户已停用: ${id}`);
  }
  const displayName =
    (rows[0].displayName && String(rows[0].displayName).trim()) || String(rows[0].username);
  return { userId: rows[0].userId, displayName };
}

/**
 * Optional FKs (campaign/group/fallback package/content) are free-form strings in the DTO.
 * Reject missing / terminal targets so KPI boards cannot be polluted by phantom ids
 * or tasks bound to completed campaigns, disabled groups, or unapproved copy.
 * Also enforce package existence + geo/merchant consistency:
 *  - group.areaId must equal package.areaId
 *  - campaign areaIds/merchantIds (when non-empty) must cover the package
 *  - fallbackPackage must share package.merchantId
 * When contentId is set, it must be approved and (when packageId known) match the task package.
 */
export async function assertOptionalTaskFks(
  prisma: PrismaTaskQuery,
  dto: {
    campaignId?: string | null;
    groupId?: string | null;
    fallbackPackageId?: string | null;
    contentId?: string | null;
    packageId?: string | null;
    /** When waiting_audit, content may be pending; otherwise content must be approved. */
    status?: string | null;
    /** On update, allow re-binding the same contentId to this task. */
    excludeTaskId?: string | null;
  }
): Promise<void> {
  // Single-row path: batch-load just this dto's ids (1 round of parallel INs).
  const maps = await loadTaskFkBatch(prisma, [
    {
      packageId: dto.packageId ?? undefined,
      campaignId: dto.campaignId ?? undefined,
      groupId: dto.groupId ?? undefined,
      fallbackPackageId: dto.fallbackPackageId ?? undefined,
      contentId: dto.contentId ?? undefined,
      assigneeId: undefined,
      channel: 'wechat'
    } as CreateTaskDto
  ]);
  assertOptionalTaskFksFromMaps(dto, maps);
}

export function assertOptionalTaskFksFromMaps(
  dto: {
    campaignId?: string | null;
    groupId?: string | null;
    fallbackPackageId?: string | null;
    contentId?: string | null;
    packageId?: string | null;
    status?: string | null;
    excludeTaskId?: string | null;
  },
  maps: TaskFkMaps
): void {
  let pkgGeo: { areaId: string; merchantId: string } | null = null;
  if (dto.packageId) {
    const pkg = maps.packages.get(dto.packageId);
    if (!pkg) throw new NotFoundException(`套餐不存在: ${dto.packageId}`);
    pkgGeo = { areaId: pkg.areaId, merchantId: pkg.merchantId };
  }

  if (dto.campaignId) {
    const camp = maps.campaigns.get(dto.campaignId);
    if (!camp) throw new NotFoundException(`活动不存在: ${dto.campaignId}`);
    if (!['draft', 'active', 'paused'].includes(String(camp.status))) {
      throw new BadRequestException(
        `活动状态为 '${camp.status}'，不可绑定新任务（仅 draft/active/paused）`
      );
    }
    if (pkgGeo) {
      const areaIds = parseJsonStringArray(camp.areaIds);
      const merchantIds = parseJsonStringArray(camp.merchantIds);
      if (areaIds.length || merchantIds.length) {
        const areaHit = areaIds.includes(pkgGeo.areaId);
        const merchantHit = merchantIds.includes(pkgGeo.merchantId);
        if (!areaHit && !merchantHit) {
          throw new BadRequestException(
            `任务套餐不在活动范围内（package area=${pkgGeo.areaId} merchant=${pkgGeo.merchantId}）`
          );
        }
      }
    }
  }
  if (dto.groupId) {
    const group = maps.groups.get(dto.groupId);
    if (!group) throw new NotFoundException(`社群不存在: ${dto.groupId}`);
    if (Number(group.isActive) !== 1) {
      throw new BadRequestException(`社群已停用，不可绑定新任务: ${dto.groupId}`);
    }
    if (pkgGeo && group.areaId && String(group.areaId) !== pkgGeo.areaId) {
      throw new BadRequestException(
        `社群 areaId=${group.areaId} 与套餐 areaId=${pkgGeo.areaId} 不一致`
      );
    }
  }
  if (dto.fallbackPackageId) {
    const fb = maps.packages.get(dto.fallbackPackageId);
    if (!fb) throw new NotFoundException(`兜底套餐不存在: ${dto.fallbackPackageId}`);
    if (pkgGeo && String(fb.merchantId) !== pkgGeo.merchantId) {
      throw new BadRequestException(
        `兜底套餐 merchantId=${fb.merchantId} 与任务套餐 merchantId=${pkgGeo.merchantId} 不一致`
      );
    }
  }
  if (dto.contentId) {
    const content = maps.contents.get(dto.contentId);
    if (!content) throw new NotFoundException(`文案不存在: ${dto.contentId}`);
    const auditStatus = String(content.auditStatus);
    if (dto.status === 'waiting_audit') {
      if (auditStatus === 'rejected' || auditStatus === 'risk') {
        throw new BadRequestException(`文案审核状态为 '${auditStatus}'，不可进入 waiting_audit`);
      }
    } else if (auditStatus !== 'approved') {
      throw new BadRequestException(`文案审核状态为 '${auditStatus}'，仅已通过文案可绑定任务`);
    }
    if (dto.packageId && content.packageId && String(content.packageId) !== String(dto.packageId)) {
      throw new BadRequestException(
        `文案 packageId=${content.packageId} 与任务 packageId=${dto.packageId} 不一致`
      );
    }
    const twinTaskId = maps.contentTwins.get(dto.contentId);
    if (twinTaskId && twinTaskId !== dto.excludeTaskId) {
      throw new BadRequestException(`文案已绑定未取消任务 ${twinTaskId}，不可重复创建`);
    }
  }
}

/** Batch FK maps for task create/batchCreate pre-validate (residual #86). */
export type TaskFkMaps = {
  packages: Map<string, { packageId: string; areaId: string; merchantId: string }>;
  campaigns: Map<
    string,
    { campaignId: string; status: string; areaIds: string | null; merchantIds: string | null }
  >;
  groups: Map<string, { groupId: string; isActive: number; areaId: string }>;
  contents: Map<string, { contentId: string; packageId: string; auditStatus: string }>;
  /** contentId → first non-cancelled taskId (live twin). */
  contentTwins: Map<string, string>;
  assignees: Map<string, { userId: string; displayName: string; active: boolean }>;
};
