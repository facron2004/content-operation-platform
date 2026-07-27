import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  AuditCopyRequest,
  AuditStatus,
  Channel,
  ContentPackage,
  CopiesResponse,
  GeneratedCopy,
  GenerateCopiesResponse,
  GenerateCopyRequest,
  SalesSnapshot
} from '@content/shared';
import { resolvePagination, describeError, beijingDateKey, shiftDateKey } from '@content/shared';
import { newEntityId } from '../common/id';
import { allocateTrackingCode } from '../common/tracking-code';
import { toSqliteDateTime } from '../common/sqlite-datetime';
import { INTERACTIVE_LIST_MAX_DAYS } from '../common/list-date-span';
import { auditCopyText, generateTemplateCopies } from '../domain/copy-rules';
import { buildPromotionScore } from '../domain/promotion-rules';
import { getFallbackDate } from '../domain/utils';
import { PrismaService } from '../prisma/prisma.service';
import { DataSourceService } from './data-source.service';
import { PackageDetailService } from './package-detail';
import { AICopyService } from './ai-copy';
import {
  COPY_LIST_SELECT,
  copyToDb,
  joinList,
  mapCopy,
  mapPackageForAudit,
  PACKAGE_AUDIT_SELECT,
  packageToDb
} from './mappers';
import { resolvePackageAndSnapshot } from './package-detail-helpers';

@Injectable()
export class CopyService {
  private readonly logger = new Logger(CopyService.name);
  /**
   * Process single-flight for generate+persist so double-click / multi-tab with
   * the same package+channel+params cannot createMany duplicate draft rows.
   * AI layer flight only covers the LLM call — createMany must sit inside this.
   */
  private readonly generateInFlight = new Map<string, Promise<GenerateCopiesResponse>>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DataSourceService) private readonly dataSource: DataSourceService,
    @Inject(PackageDetailService) private readonly packageDetailService: PackageDetailService,
    @Inject(AICopyService) private readonly aiCopyService: AICopyService
  ) {}

  /** 解析套餐 + 快照（委托给 shared-helpers 公共方法） */
  private async resolvePackageAndSnapshot(
    packageId: string
  ): Promise<{ pkg: ContentPackage; snapshot: SalesSnapshot } | null> {
    const result = await resolvePackageAndSnapshot(packageId, this.dataSource);
    if (!result) return null;
    return { pkg: result.pkg, snapshot: result.snapshot };
  }

  /**
   * Ensure the package row exists for FK from GeneratedCopy.
   * Never rewrite merchantId/areaId/areaName on update — those are frozen while
   * live DistributionTasks reference the package (same threat model as
   * ContentService.syncMerchantsFromJeeSite CASE freeze). Copy generation must
   * not retarget attribution geography via a divergent JeeSite snapshot.
   */
  private async ensurePackagePersisted(pkg: ContentPackage): Promise<void> {
    const data = packageToDb(pkg);
    const {
      packageId: _packageId,
      merchantId: _merchantId,
      areaId: _areaId,
      areaName: _areaName,
      ...nonGeoUpdate
    } = data;
    await this.prisma.contentPackage.upsert({
      where: { packageId: pkg.packageId },
      update: nonGeoUpdate,
      create: data
    });
  }

  async generateCopies(request: GenerateCopyRequest): Promise<GenerateCopiesResponse> {
    if (!request.packageId || !request.channel) {
      throw new BadRequestException('packageId、channel 必填');
    }
    // Defense-in-depth: DTO Max(5) + generator clamps; still bound here if called internally.
    const rawCount = Number(request.copyCount || 3);
    const copyCount = Number.isFinite(rawCount)
      ? Math.min(5, Math.max(1, Math.floor(rawCount)))
      : 3;
    const normalizedRequest: GenerateCopyRequest = {
      ...request,
      scenario: request.scenario?.trim() || '日常运营推荐',
      tone: request.tone?.trim() || '真实运营口吻',
      copyCount
    };

    // Coalesce identical generate+persist so concurrent submits share one createMany.
    const flightKey = [
      normalizedRequest.packageId,
      normalizedRequest.channel,
      String(normalizedRequest.copyCount),
      normalizedRequest.scenario ?? '',
      normalizedRequest.tone ?? '',
      normalizedRequest.useAI ? 'ai' : 'tpl'
    ].join('|');
    const pending = this.generateInFlight.get(flightKey);
    if (pending) return pending;

    const run = this.doGenerateAndPersist(normalizedRequest);
    this.generateInFlight.set(flightKey, run);
    try {
      return await run;
    } finally {
      if (this.generateInFlight.get(flightKey) === run) this.generateInFlight.delete(flightKey);
    }
  }

  private async doGenerateAndPersist(
    normalizedRequest: GenerateCopyRequest
  ): Promise<GenerateCopiesResponse> {
    const resolved = await this.resolvePackageAndSnapshot(normalizedRequest.packageId);
    if (!resolved) throw new NotFoundException(`套餐不存在: ${normalizedRequest.packageId}`);

    const { pkg, snapshot } = resolved;
    await this.ensurePackagePersisted(pkg);
    const promotion = buildPromotionScore(pkg, snapshot, getFallbackDate());

    let packageDetail = null;
    try {
      packageDetail = await this.packageDetailService.fetchPackageDetail(
        normalizedRequest.packageId
      );
    } catch (error: unknown) {
      this.logger.warn(`获取套餐详情失败 ${normalizedRequest.packageId}: ${describeError(error)}`);
    }

    const copies = normalizedRequest.useAI
      ? await this.aiCopyService.generateCopies(pkg, promotion, normalizedRequest, packageDetail)
      : generateTemplateCopies(pkg, promotion, normalizedRequest, packageDetail);

    await this.prisma.generatedCopy.createMany({ data: copies.map(copyToDb) });

    // 不再自动生成模拟效果数据——CopyPerformance 记录应在真实埋点上报时写入
    // (预留:接入 tracking webhook 后由 webhook 创建)

    return { contentList: copies };
  }

  async listCopies(
    filters: {
      auditStatus?: AuditStatus;
      channel?: Channel;
      areaIds?: string[];
      merchantIds?: string[];
    },
    page?: number,
    pageSize?: number
  ): Promise<CopiesResponse> {
    const { offset, ...pagination } = resolvePagination(page, pageSize, 0);

    // Residual #166: filter GeneratedCopy denorm areaId/merchantId directly —
    // drop ContentPackage relation join. Denorm columns are stamped at generate
    // and indexed (@@index([areaId])); OR-of-IN still ≤ MAX_SCOPE_IDS=200.
    // Avoid materializing packageId IN (...) capped by PLATFORM_SCAN_LIMIT.
    const areaIds = filters.areaIds?.length ? filters.areaIds.slice(0, 200) : undefined;
    const merchantIds = filters.merchantIds?.length ? filters.merchantIds.slice(0, 200) : undefined;
    const geoScope =
      areaIds?.length || merchantIds?.length
        ? {
            OR: [
              ...(areaIds?.length ? [{ areaId: { in: areaIds } }] : []),
              ...(merchantIds?.length ? [{ merchantId: { in: merchantIds } }] : [])
            ]
          }
        : {};

    // Cap interactive copy list at trailing 90d — unbounded COUNT + ORDER BY on
    // GeneratedCopy pins SQLite as history accumulates (parity with audit/task lists).
    const dateTo = beijingDateKey(new Date());
    const dateFrom = shiftDateKey(dateTo, -(INTERACTIVE_LIST_MAX_DAYS - 1));
    const createdAtWindow = {
      gte: new Date(`${dateFrom}T00:00:00+08:00`),
      lt: new Date(new Date(`${dateTo}T00:00:00+08:00`).getTime() + 24 * 3600 * 1000)
    };

    const where = {
      auditStatus: filters.auditStatus,
      channel: filters.channel,
      createdAt: createdAtWindow,
      ...geoScope
    };

    const [rows, total] = await Promise.all([
      this.prisma.generatedCopy.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pagination.pageSize,
        // List omits body/cta blobs — audit/detail loads full row via getCopy.
        select: COPY_LIST_SELECT
      }),
      this.prisma.generatedCopy.count({ where })
    ]);

    // 拿到真实 total 后重新计算 totalPages
    const finalPagination = resolvePagination(page, pageSize, total);
    return {
      items: rows.map(mapCopy),
      pagination: {
        page: finalPagination.page,
        pageSize: finalPagination.pageSize,
        total,
        totalPages: finalPagination.totalPages,
        dateFrom,
        dateTo
      }
    };
  }

  /** Full copy (incl. body/cta) for audit editor / detail panel. */
  async getCopy(contentId: string): Promise<GeneratedCopy> {
    const row = await this.prisma.generatedCopy.findUnique({ where: { contentId } });
    if (!row) throw new NotFoundException('文案不存在');
    return mapCopy(row);
  }

  // Residual #119: removed dead getCopyPackageId — controllers use getCopy.packageId
  // for scope (#104 detail / #114 audit). No remaining callers.

  /**
   * Residual #114: optional `preloaded` (controller getCopy) skips the pre-check
   * findUnique so audit is one full-row read for scope + gates. Two-arg form still
   * loads once for unit tests / internal callers. Post-write re-read unchanged.
   */
  async auditCopy(
    contentId: string,
    request: AuditCopyRequest & { mintDistributionTask?: boolean },
    preloaded?: GeneratedCopy
  ): Promise<{
    success: true;
    contentId: string;
    packageId: string;
    channel: string;
    auditStatus: string;
    distributionTaskId?: string;
  }> {
    const row = preloaded
      ? null
      : await this.prisma.generatedCopy.findUnique({ where: { contentId } });
    if (!preloaded && !row) throw new NotFoundException('文案不存在');

    const auditStatus = preloaded?.auditStatus ?? row!.auditStatus;
    const packageId = preloaded?.packageId ?? row!.packageId;
    const channel = preloaded?.channel ?? row!.channel;
    const titleBase = preloaded?.title ?? row!.title;
    const bodyBase = preloaded?.body ?? row!.body;
    const cta = preloaded?.cta ?? row!.cta ?? null;
    const strategyType = preloaded?.strategyType ?? row!.strategyType;

    // Terminal audit decisions are frozen — re-approve/reject would desync the
    // auto-created DistributionTask and rewrite published copy history.
    // Idempotent re-approve of already-approved is allowed (ensureTask only).
    if (auditStatus === 'rejected') {
      throw new BadRequestException('文案已驳回，不可再次审核');
    }
    if (auditStatus === 'approved' && request.auditStatus !== 'approved') {
      throw new BadRequestException('文案已通过，不可改为其他审核状态');
    }

    // Residual #133: machine audit only needs price/stock/useRules — not full package map.
    const packageRow = await this.prisma.contentPackage.findUnique({
      where: { packageId },
      select: PACKAGE_AUDIT_SELECT
    });
    if (!packageRow) throw new NotFoundException(`套餐不存在: ${packageId}`);

    const pkg = mapPackageForAudit(packageRow);
    // Idempotent re-approve: do not rewrite title/body/version after first approve.
    if (auditStatus === 'approved' && request.auditStatus === 'approved') {
      let distributionTaskId: string | undefined;
      // Auditors may re-read approve state but must not mint operator lifecycle tasks.
      if (request.mintDistributionTask !== false) {
        try {
          distributionTaskId = await this.ensureTaskForApprovedCopy({
            contentId,
            packageId,
            channel,
            title: titleBase,
            body: bodyBase,
            cta
          });
        } catch (err: unknown) {
          this.logger.warn(`Auto-create task failed for copy ${contentId}: ${describeError(err)}`);
        }
      }
      // Residual #168: SPA discards body + reloads list — slim shell (parity with happy path).
      return {
        success: true as const,
        contentId,
        packageId,
        channel,
        auditStatus: 'approved',
        distributionTaskId
      };
    }

    const title = request.title ?? titleBase;
    const body = request.body ?? bodyBase;
    const machineAudit = auditCopyText(pkg, {
      title,
      body,
      strategyType: strategyType as GeneratedCopy['strategyType']
    });
    const finalStatus =
      machineAudit.riskLevel === 'high' && request.auditStatus === 'approved'
        ? 'risk'
        : request.auditStatus;

    // Residual #104: atomic versionNo = MAX(packageId,channel)+1 inside the same
    // conditional UPDATE (status pin). Drops pre-COUNT TOCTOU + extra index scan.
    // SQLite needs a derived-table wrap so the UPDATE target is not scanned live.
    // Residual #168: SPA submitAuditCopy discards body + reloads list — drop the
    // full-row response payload; changed-rows is the existence/status probe
    // (parity with #163/#164/#165). ensureTask uses request/preloaded fields only.
    const auditRemark =
      request.auditRemark ??
      (machineAudit.riskTips.length > 0 ? machineAudit.riskTips.join('；') : null);
    const riskTips = joinList(machineAudit.riskTips);
    const now = toSqliteDateTime();
    const changed = Number(
      (await this.prisma.$executeRawUnsafe(
        `UPDATE "GeneratedCopy"
         SET "title" = ?,
             "body" = ?,
             "auditStatus" = ?,
             "auditRemark" = ?,
             "riskLevel" = ?,
             "riskTips" = ?,
             "versionNo" = (
               SELECT COALESCE(MAX(v."versionNo"), 0) + 1
               FROM (
                 SELECT "versionNo"
                 FROM "GeneratedCopy"
                 WHERE "packageId" = ? AND "channel" = ?
               ) AS v
             ),
             "updatedAt" = ?
         WHERE "contentId" = ?
           AND "auditStatus" IN ('pending', 'draft', 'risk')`,
        title,
        body,
        finalStatus,
        auditRemark,
        machineAudit.riskLevel,
        riskTips,
        packageId,
        channel,
        now,
        contentId
      )) ?? 0
    );
    if (changed <= 0) {
      // Status-only re-read for error message — avoid full body/cta blob.
      const latest = await this.prisma.generatedCopy.findUnique({
        where: { contentId },
        select: { auditStatus: true }
      });
      if (!latest) throw new NotFoundException('文案不存在');
      throw new BadRequestException(
        `文案审核状态已变更（当前 '${latest.auditStatus}'），请刷新后重试`
      );
    }

    // Auto-create DistributionTask when approved (mint tracking code like DistributionTaskService.create).
    // Re-approve / double-click must not mint N draft tasks for the same copy.
    // Concurrent approves: deterministic taskId from contentId makes the second INSERT fail
    // on PK, then we re-read the winner instead of minting twins.
    // Auditors may approve/reject copy but must not mint operator lifecycle tasks.
    let distributionTaskId: string | undefined;
    if (finalStatus === 'approved' && request.mintDistributionTask !== false) {
      try {
        distributionTaskId = await this.ensureTaskForApprovedCopy({
          contentId,
          packageId,
          channel,
          title,
          body,
          cta
        });
      } catch (err: unknown) {
        this.logger.warn(`Auto-create task failed for copy ${contentId}: ${describeError(err)}`);
      }
    }

    return {
      success: true as const,
      contentId,
      packageId,
      channel,
      auditStatus: finalStatus,
      distributionTaskId
    };
  }

  /** Crypto-random 10-char tracking code unique across DistributionTask rows. */
  private async mintTrackingCode(): Promise<string> {
    return allocateTrackingCode(this.prisma, {
      onExhausted: () => {
        throw new BadRequestException('Unable to allocate unique tracking code');
      }
    });
  }

  /**
   * Return the non-cancelled task for this contentId, creating one if missing.
   * Deterministic taskId closes concurrent-approve TOCTOU (PK collision → re-read).
   */
  private async ensureTaskForApprovedCopy(input: {
    contentId: string;
    packageId: string;
    channel: string;
    title: string;
    body: string;
    cta: string | null;
  }): Promise<string> {
    const existing = await this.prisma.$queryRawUnsafe<Array<{ taskId: string; status: string }>>(
      `SELECT "taskId", "status" FROM "DistributionTask"
       WHERE "contentId" = ? AND "status" <> 'cancelled'
       ORDER BY "createdAt" DESC
       LIMIT 1`,
      input.contentId
    );
    if (existing.length) {
      // Promote waiting_audit → draft once copy is approved so schedule/publish can proceed.
      // Status-pinned so concurrent cancel/schedule cannot be overwritten.
      if (existing[0].status === 'waiting_audit') {
        const now = toSqliteDateTime();
        await this.prisma
          .$executeRawUnsafe(
            `UPDATE "DistributionTask"
             SET "status" = 'draft', "title" = ?, "body" = ?, "cta" = ?, "updatedAt" = ?
             WHERE "taskId" = ? AND "status" = 'waiting_audit'`,
            input.title,
            input.body,
            input.cta,
            now,
            existing[0].taskId
          )
          .catch(() => {});
      }
      return existing[0].taskId;
    }

    // Stable id per content — concurrent inserts collide on PK instead of both succeeding.
    const taskId = `task_copy_${input.contentId}`.slice(0, 64);
    const trackingCode = await this.mintTrackingCode();
    const now = toSqliteDateTime();
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "DistributionTask" ("taskId", "contentId", "packageId", "channel", "title", "body", "cta", "trackingCode", "status", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
        taskId,
        input.contentId,
        input.packageId,
        input.channel,
        input.title,
        input.body,
        input.cta,
        trackingCode,
        now,
        now
      );
      return taskId;
    } catch (err: unknown) {
      // Lost the race: another approve inserted first (or cancelled twin still holds PK).
      const winner = await this.prisma.$queryRawUnsafe<Array<{ taskId: string }>>(
        `SELECT "taskId" FROM "DistributionTask"
         WHERE "contentId" = ? AND "status" <> 'cancelled'
         ORDER BY "createdAt" DESC
         LIMIT 1`,
        input.contentId
      );
      if (winner.length) return winner[0].taskId;
      // PK held by a cancelled row — fall back to random id once.
      const fallbackId = newEntityId('task');
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "DistributionTask" ("taskId", "contentId", "packageId", "channel", "title", "body", "cta", "trackingCode", "status", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
        fallbackId,
        input.contentId,
        input.packageId,
        input.channel,
        input.title,
        input.body,
        input.cta,
        trackingCode,
        now,
        now
      );
      return fallbackId;
    }
  }
}
