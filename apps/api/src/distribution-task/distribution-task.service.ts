import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DistributionExecutionService } from './distribution-execution.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import { PublishTaskDto } from './dto/publish-task.dto';
import { FailTaskDto } from './dto/fail-task.dto';
import { newEntityId } from '../common/id';
import { toSqliteDateTime } from '../common/sqlite-datetime';
import { allocateTrackingCode, allocateTrackingCodes } from '../common/tracking-code';
import { auditCopyText } from '../domain/copy-rules';
import { mapPackageForAudit, type PackageAuditRow } from '../content/mappers';
import {
  findTaskRow,
  getTaskKpi,
  getTaskPerformance,
  listTasks,
  parseTask,
  TASK_STATUS_MUTATE_COLUMNS,
  type TaskRow
} from './distribution-task-query';
import { canTransition } from './distribution-task-transitions';

/** Normalize optional plannedAt to SQLite-comparable UTC space form. */
function normalizePlannedAt(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  return toSqliteDateTime(value);
}

@Injectable()
export class DistributionTaskService {
  private readonly logger = new Logger(DistributionTaskService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DistributionExecutionService)
    private readonly executionService: DistributionExecutionService
  ) {}

  async list(
    query: TaskQueryDto,
    scope?: { unrestricted: boolean; areaIds: string[]; merchantIds: string[] }
  ) {
    return listTasks(this.prisma, query, scope);
  }

  async getKpi() {
    return getTaskKpi(this.prisma);
  }

  async getById(id: string) {
    const { packageGeo, ...task } = await this.getTaskRow(id);
    const timeline = await this.executionService.findByTaskId(id);
    // Residual #167: keep packageGeo for controller scope; strip from SPA detail body
    // only after assertTaskAccess — controller re-attaches via separate call path.
    // Residual #260: honesty flags when ASC LIMIT clips newer executions.
    return {
      ...task,
      executions: timeline.items,
      executionsTruncated: timeline.truncated,
      executionsLimit: timeline.limit,
      packageGeo
    };
  }

  /**
   * Residual #107/#116/#156: full task row without executions timeline.
   * Mutate pre-checks never read executions; status-mutate success (#116)
   * returns this instead of getById (SPA reloads detail timeline separately).
   * Public so controller can scope + pass preloaded into publish/schedule (#156).
   * Residual #167: packageGeo folded via LEFT JOIN so assertTaskAccess skips package SELECT.
   */
  async getTaskRow(id: string) {
    const row = await findTaskRow(this.prisma, id);
    if (!row) throw new NotFoundException('Distribution task not found');
    // Include trackingCode for admin/operator controller gate; list still redacts.
    // packageGeo is controller-only (scope fold); strip from SPA-facing detail body.
    const { packageGeo, ...task } = row;
    return {
      ...parseTask(task, { includeTrackingCode: true }),
      packageGeo
    };
  }

  /** Status-only probe for transition gates (parity with campaign #106). */
  private async getTaskStatus(id: string): Promise<string> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ status: string }>>(
      `SELECT "status" FROM "DistributionTask" WHERE "taskId" = ?`,
      id
    );
    if (rows.length === 0) throw new NotFoundException('Distribution task not found');
    return rows[0].status;
  }

  /**
   * Residual #107: status + publishedAt for delete pre-check (no executions / body).
   * Residual #159: also packageId so controller can scope from the same probe.
   * Residual #160: LEFT JOIN package geo so assertTaskAccess skips a second SELECT.
   */
  async getTaskDeleteMeta(id: string): Promise<{
    packageId: string;
    status: string;
    publishedAt: string | null;
    packageGeo: { areaId: string | null; merchantId: string | null } | null;
  }> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        packageId: string;
        status: string;
        publishedAt: string | null;
        areaId: string | null;
        merchantId: string | null;
        pkgKey: string | null;
      }>
    >(
      `SELECT t."packageId", t."status", t."publishedAt",
              p."areaId" AS "areaId", p."merchantId" AS "merchantId", p."packageId" AS "pkgKey"
       FROM "DistributionTask" t
       LEFT JOIN "ContentPackage" p ON p."packageId" = t."packageId"
       WHERE t."taskId" = ?`,
      id
    );
    if (rows.length === 0) throw new NotFoundException('Distribution task not found');
    const row = rows[0];
    return {
      packageId: row.packageId,
      status: row.status,
      publishedAt: row.publishedAt,
      packageGeo: row.pkgKey == null ? null : { areaId: row.areaId, merchantId: row.merchantId }
    };
  }

  /**
   * Residual #129/#156: update pre-load / freeze-race arm projection.
   * Freeze only needs status+publishedAt; FK re-check needs package/content/FKs.
   * Drops body/title/cta/trackingCode and other free-form columns.
   * Residual #160: LEFT JOIN package geo for controller scope fold.
   */
  async getTaskUpdateMeta(id: string): Promise<{
    status: string;
    publishedAt: string | null;
    packageId: string;
    contentId: string | null;
    campaignId: string | null;
    groupId: string | null;
    fallbackPackageId: string | null;
    packageGeo: { areaId: string | null; merchantId: string | null } | null;
  }> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        status: string;
        publishedAt: string | null;
        packageId: string;
        contentId: string | null;
        campaignId: string | null;
        groupId: string | null;
        fallbackPackageId: string | null;
        areaId: string | null;
        merchantId: string | null;
        pkgKey: string | null;
      }>
    >(
      `SELECT t."status", t."publishedAt", t."packageId", t."contentId", t."campaignId", t."groupId", t."fallbackPackageId",
              p."areaId" AS "areaId", p."merchantId" AS "merchantId", p."packageId" AS "pkgKey"
       FROM "DistributionTask" t
       LEFT JOIN "ContentPackage" p ON p."packageId" = t."packageId"
       WHERE t."taskId" = ?`,
      id
    );
    if (rows.length === 0) throw new NotFoundException('Distribution task not found');
    const row = rows[0];
    return {
      status: row.status,
      publishedAt: row.publishedAt,
      packageId: row.packageId,
      contentId: row.contentId,
      campaignId: row.campaignId,
      groupId: row.groupId,
      fallbackPackageId: row.fallbackPackageId,
      packageGeo: row.pkgKey == null ? null : { areaId: row.areaId, merchantId: row.merchantId }
    };
  }

  /**
   * Residual #108/#151: controller scope probe. Returns packageId (+ status so
   * status mutators can skip a second SELECT).
   * Residual #160: LEFT JOIN package geo so assertTaskAccess skips package re-SELECT.
   */
  async getTaskAccessMeta(id: string): Promise<{
    packageId: string;
    status: string;
    packageGeo: { areaId: string | null; merchantId: string | null } | null;
  }> {
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        packageId: string;
        status: string;
        areaId: string | null;
        merchantId: string | null;
        pkgKey: string | null;
      }>
    >(
      `SELECT t."packageId", t."status",
              p."areaId" AS "areaId", p."merchantId" AS "merchantId", p."packageId" AS "pkgKey"
       FROM "DistributionTask" t
       LEFT JOIN "ContentPackage" p ON p."packageId" = t."packageId"
       WHERE t."taskId" = ?`,
      id
    );
    if (rows.length === 0) throw new NotFoundException('Distribution task not found');
    const row = rows[0];
    return {
      packageId: row.packageId,
      status: row.status,
      packageGeo: row.pkgKey == null ? null : { areaId: row.areaId, merchantId: row.merchantId }
    };
  }

  /** Residual #108 packageId-only alias for callers that do not need status/geo. */
  async getTaskPackageId(id: string): Promise<string> {
    return (await this.getTaskAccessMeta(id)).packageId;
  }

  async create(dto: CreateTaskDto) {
    // Honor idempotencyKey when present — return the existing row instead of inserting a twin.
    const idempotencyKey = dto.idempotencyKey?.trim().slice(0, 100) || null;
    if (idempotencyKey) {
      const existing = await this.findByIdempotencyKey(idempotencyKey);
      // Residual #172: SPA form create discards body + reloads list — slim shell
      // is enough on idempotent hit (no free-form / trackingCode leak).
      if (existing) {
        return {
          success: true as const,
          taskId: existing,
          status: await this.getTaskStatusOnly(existing)
        };
      }
    }

    const status = dto.status ?? 'draft';
    this.assertCreateStatusRules(dto, status);

    // One parallel IN round for FKs + assignee (residual #88; was 2× loadTaskFkBatch).
    const maps = await this.loadTaskFkBatch([dto]);
    this.assertOptionalTaskFksFromMaps(
      {
        campaignId: dto.campaignId,
        groupId: dto.groupId,
        fallbackPackageId: dto.fallbackPackageId,
        contentId: dto.contentId,
        packageId: dto.packageId,
        status
      },
      maps
    );
    const assignee = this.resolveActiveAssigneeFromMap(dto.assigneeId, maps.assignees);

    // Residual #172: single create and batch share the same slim insert shell.
    return this.insertTaskRow(dto, status, assignee, {});
  }

  /** Shared status integrity checks for create / batchCreate. */
  private assertCreateStatusRules(dto: CreateTaskDto, status: string): void {
    // scheduled without plannedAt is unpublishable forever and confuses overdue/KPI scans.
    if (status === 'scheduled' && !dto.plannedAt) {
      throw new BadRequestException('status=scheduled 时必须提供 plannedAt');
    }
    // Match schedule() integrity: scheduled must have approved contentId or free-form body
    // so publish cannot open an empty attribution window.
    if (status === 'scheduled' && !dto.contentId?.trim() && !dto.body?.trim()) {
      throw new BadRequestException('status=scheduled 时必须提供 contentId 或 body');
    }
    // waiting_audit is the "bound to pending copy" state — requires a contentId.
    if (status === 'waiting_audit' && !dto.contentId?.trim()) {
      throw new BadRequestException('status=waiting_audit 时必须提供 contentId');
    }
  }

  /**
   * Insert one DistributionTask after FK/assignee resolution.
   * Residual #172: return slim shell only — SPA form create / batch discard bodies
   * and reload lists. Never emit free-form body/title/cta or trackingCode on create
   * (list path already redacts trackingCode). opts.trackingCode reuses a pre-allocated
   * code (residual #90 bulk mint). UNIQUE race winner returns slim shell too.
   */
  private async insertTaskRow(
    dto: CreateTaskDto,
    status: string,
    assignee: { userId: string; displayName: string } | null,
    opts: { trackingCode?: string }
  ) {
    const idempotencyKey = dto.idempotencyKey?.trim().slice(0, 100) || null;
    const taskId = this.generateId();
    const now = toSqliteDateTime();
    // Always mint a crypto tracking code so clients cannot plant guessable short links.
    // Batch path passes pre-allocated codes to avoid N× uniqueness probes.
    const trackingCode = opts.trackingCode ?? (await this.mintTrackingCode());

    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "DistributionTask" ("taskId", "campaignId", "contentId", "groupId", "packageId", "channel", "title", "body", "cta", "trackingCode", "status", "priority", "plannedAt", "assigneeId", "assigneeName", "riskLevel", "fallbackPackageId", "idempotencyKey", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        taskId,
        dto.campaignId ?? null,
        dto.contentId ?? null,
        dto.groupId ?? null,
        dto.packageId,
        dto.channel,
        dto.title ?? null,
        dto.body ?? null,
        dto.cta ?? null,
        trackingCode,
        status,
        dto.priority ?? 'normal',
        normalizePlannedAt(dto.plannedAt),
        assignee?.userId ?? null,
        assignee?.displayName ?? null,
        dto.riskLevel ?? 'low',
        dto.fallbackPackageId ?? null,
        idempotencyKey,
        now,
        now
      );
    } catch (err) {
      // Race: concurrent create with the same key — unique index wins; return the winner.
      if (idempotencyKey && this.isUniqueViolation(err)) {
        const winner = await this.findByIdempotencyKey(idempotencyKey);
        // Residual #172: slim shell on race winner (no free-form / trackingCode).
        if (winner) {
          return {
            success: true as const,
            taskId: winner,
            status: await this.getTaskStatusOnly(winner)
          };
        }
      }
      throw err;
    }
    // Residual #172: slim shell — SPA discards body + reloads list.
    return { success: true as const, taskId, status };
  }

  /** Status-only probe for create idempotent-hit / UNIQUE-race slim shells. */
  private async getTaskStatusOnly(taskId: string): Promise<string> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ status: string }>>(
      `SELECT "status" FROM "DistributionTask" WHERE "taskId" = ? LIMIT 1`,
      taskId
    );
    return rows[0]?.status ?? 'draft';
  }

  private async findByIdempotencyKey(key: string): Promise<string | null> {
    const existing = await this.prisma.$queryRawUnsafe<Array<{ taskId: string }>>(
      `SELECT "taskId" FROM "DistributionTask" WHERE "idempotencyKey" = ? LIMIT 1`,
      key
    );
    return existing[0]?.taskId ?? null;
  }

  private isUniqueViolation(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    return /UNIQUE constraint failed|unique constraint|SQLITE_CONSTRAINT_UNIQUE/i.test(msg);
  }

  async batchCreate(dtos: CreateTaskDto[]) {
    const list = Array.isArray(dtos) ? dtos : [];
    // Residual #86: batch-preload FKs/assignees (IN queries) so pre-validate is O(tables)
    // not O(rows×~6 SELECTs). Residual #88: insert path reuses the same maps (pure re-assert)
    // and returns slim rows — no N× create() FK reload + getById/executions.
    // Residual #90: bulk-allocate tracking codes (one IN probe) before the insert loop.
    // Note: full $transaction is deferred — inserts remain serial per row.
    const maps = await this.loadTaskFkBatch(list);
    // Resolved assignees cached so insert does not re-walk maps.assignees.
    const assignees: Array<{ userId: string; displayName: string } | null> = [];
    for (let i = 0; i < list.length; i++) {
      const dto = list[i];
      const status = dto.status ?? 'draft';
      try {
        this.assertCreateStatusRules(dto, status);
        this.assertOptionalTaskFksFromMaps(
          {
            campaignId: dto.campaignId,
            groupId: dto.groupId,
            fallbackPackageId: dto.fallbackPackageId,
            contentId: dto.contentId,
            packageId: dto.packageId,
            status
          },
          maps
        );
        assignees.push(this.resolveActiveAssigneeFromMap(dto.assigneeId, maps.assignees));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err ?? 'validation failed');
        throw new BadRequestException(`批量创建第 ${i + 1} 行失败: ${msg}`);
      }
    }
    // Within-batch contentId uniqueness (assertOptionalTaskFks only sees already-committed rows).
    const seenContent = new Set<string>();
    for (let i = 0; i < list.length; i++) {
      const cid = list[i].contentId?.trim();
      if (!cid) continue;
      if (seenContent.has(cid)) {
        throw new BadRequestException(
          `批量创建第 ${i + 1} 行失败: 文案 contentId=${cid} 在同一批次中重复绑定`
        );
      }
      seenContent.add(cid);
    }
    // Pre-mint N unique tracking codes so insert loop does not N× COUNT/IN probe.
    // @@unique([trackingCode]) still guards rare races at INSERT time.
    const trackingCodes = await allocateTrackingCodes(this.prisma, list.length, {
      onExhausted: () => {
        throw new BadRequestException('Unable to allocate unique tracking code');
      }
    });
    // Mid-batch content twins: mark each contentId as claimed after insert so a
    // later row cannot bind the same content that was just committed in this batch
    // (maps.contentTwins is a snapshot from pre-validate only).
    // Residual #172: track taskIds only (count shell + bulk rollback); no items[].
    const createdIds: string[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        const dto = list[i];
        const status = dto.status ?? 'draft';
        // Re-assert content twin against maps that include earlier inserts.
        if (dto.contentId?.trim()) {
          this.assertOptionalTaskFksFromMaps(
            {
              campaignId: dto.campaignId,
              groupId: dto.groupId,
              fallbackPackageId: dto.fallbackPackageId,
              contentId: dto.contentId,
              packageId: dto.packageId,
              status
            },
            maps
          );
        }
        const created = await this.insertTaskRow(dto, status, assignees[i], {
          trackingCode: trackingCodes[i]
        });
        if (created?.taskId) {
          createdIds.push(String(created.taskId));
          // Register twin so remaining rows see this content as taken.
          // contentId comes from the input DTO (not the slim shell).
          const cid = dto.contentId?.trim();
          if (cid && !maps.contentTwins.has(cid)) {
            maps.contentTwins.set(cid, String(created.taskId));
          }
        }
      }
    } catch (err) {
      // Best-effort bulk rollback of already-inserted rows so a mid-batch
      // unique/FK failure does not leave orphan draft tasks.
      // Residual #96: one DELETE … IN (…) per chunk (not N serial DELETEs).
      // Full $transaction still deferred — this only collapses write chatter.
      if (createdIds.length) {
        try {
          const ROLLBACK_CHUNK = 100;
          for (let i = 0; i < createdIds.length; i += ROLLBACK_CHUNK) {
            const slice = createdIds.slice(i, i + ROLLBACK_CHUNK);
            const ph = slice.map(() => '?').join(',');
            await this.prisma.$executeRawUnsafe(
              `DELETE FROM "DistributionTask"
               WHERE "taskId" IN (${ph})
                 AND "status" IN ('draft', 'waiting_audit', 'scheduled')`,
              ...slice
            );
          }
        } catch (cleanupErr) {
          this.logger.warn(
            `batchCreate rollback failed for ${createdIds.length} tasks: ${cleanupErr}`
          );
        }
      }
      throw err;
    }
    // Residual #172: SPA discards batch body + reloads list — count only
    // (no free-form items[] / trackingCode). Multi-row insert path kept.
    return { success: true as const, created: createdIds.length };
  }

  async update(
    id: string,
    dto: UpdateTaskDto,
    preloadedMeta?: {
      status: string;
      publishedAt: string | null;
      packageId: string;
      contentId: string | null;
      campaignId: string | null;
      groupId: string | null;
      fallbackPackageId: string | null;
    }
  ) {
    // Residual #129: freeze/FK projection only — not full getTaskRow (body/title/cta).
    // Residual #156: controller may pass meta from the same probe used for scope.
    const existing = preloadedMeta ?? (await this.getTaskUpdateMeta(id));

    // After any publish stamp (or terminal status), freeze attribution-sensitive
    // fields so tracking/KPI history cannot be retargeted onto a different
    // package/channel/copy — including cancelled-after-publish rewrite.
    // Once scheduled (pre-publish), also freeze copy/package/group/campaign so
    // publish cannot be laundered by rebinding geography under an approved copy.
    // plannedAt stays mutable for reschedule only until publishedAt is set.
    const hasPublishedHistory = Boolean(existing.publishedAt);
    const terminal =
      existing.status === 'published' ||
      existing.status === 'completed' ||
      existing.status === 'overdue' ||
      existing.status === 'cancelled' ||
      existing.status === 'failed';
    const frozen = hasPublishedHistory || terminal;
    const scheduledFreeze = existing.status === 'scheduled' && !frozen;
    if (frozen || scheduledFreeze) {
      const frozenFields = frozen
        ? ([
            'packageId',
            'channel',
            'contentId',
            'body',
            'title',
            'cta',
            'campaignId',
            'groupId',
            'fallbackPackageId',
            'plannedAt'
          ] as const)
        : ([
            'packageId',
            'channel',
            'fallbackPackageId',
            'contentId',
            'body',
            'title',
            'cta',
            'campaignId',
            'groupId'
          ] as const);
      const attempted = frozenFields.filter((f) => dto[f] !== undefined);
      if (attempted.length) {
        throw new BadRequestException(
          `任务状态为 '${existing.status}'，不可修改: ${attempted.join(', ')}`
        );
      }
    }

    // packageId used for contentId FK package match when content is reassigned.
    // Always re-check existing content against effective package so a packageId
    // change on draft/waiting_audit cannot leave a mismatched bound copy.
    const effectivePackageId = dto.packageId ?? existing.packageId;
    const effectiveContentId = dto.contentId !== undefined ? dto.contentId : existing.contentId;
    await this.assertOptionalTaskFks({
      ...dto,
      packageId: effectivePackageId,
      contentId: effectiveContentId,
      // Keep existing status so waiting_audit tasks can rebind pending copy.
      status: existing.status,
      excludeTaskId: id
    });
    // Resolve assignee when id is (re)bound; clearing assigneeId also clears name.
    let resolvedAssignee: { userId: string; displayName: string } | null | undefined = undefined;
    if (dto.assigneeId !== undefined) {
      resolvedAssignee = await this.resolveActiveAssignee(dto.assigneeId);
    }

    const sets: string[] = [];
    const params: unknown[] = [];

    if (dto.campaignId !== undefined) {
      sets.push('"campaignId" = ?');
      params.push(dto.campaignId ?? null);
    }
    if (dto.contentId !== undefined) {
      sets.push('"contentId" = ?');
      params.push(dto.contentId ?? null);
    }
    if (dto.groupId !== undefined) {
      sets.push('"groupId" = ?');
      params.push(dto.groupId ?? null);
    }
    if (dto.packageId !== undefined) {
      sets.push('"packageId" = ?');
      params.push(dto.packageId);
    }
    if (dto.channel !== undefined) {
      sets.push('"channel" = ?');
      params.push(dto.channel);
    }
    if (dto.title !== undefined) {
      sets.push('"title" = ?');
      params.push(dto.title ?? null);
    }
    if (dto.body !== undefined) {
      sets.push('"body" = ?');
      params.push(dto.body ?? null);
    }
    if (dto.cta !== undefined) {
      sets.push('"cta" = ?');
      params.push(dto.cta ?? null);
    }
    if (dto.priority !== undefined) {
      sets.push('"priority" = ?');
      params.push(dto.priority);
    }
    if (dto.plannedAt !== undefined) {
      sets.push('"plannedAt" = ?');
      params.push(normalizePlannedAt(dto.plannedAt));
    }
    if (dto.assigneeId !== undefined) {
      sets.push('"assigneeId" = ?');
      params.push(resolvedAssignee?.userId ?? null);
      // Always pair name with resolved id (or null) — ignore free-form assigneeName.
      sets.push('"assigneeName" = ?');
      params.push(resolvedAssignee?.displayName ?? null);
    }
    if (dto.riskLevel !== undefined) {
      sets.push('"riskLevel" = ?');
      params.push(dto.riskLevel);
    }
    if (dto.fallbackPackageId !== undefined) {
      sets.push('"fallbackPackageId" = ?');
      params.push(dto.fallbackPackageId ?? null);
    }

    // Residual #153: empty PATCH — freeze pre-probe already proved existence.
    // SPA form discards body + reloads list/detail; skip full getTaskRow re-SELECT.
    // Shell carries only freeze-projection fields (no invented channel/priority/timestamps).
    if (sets.length === 0) {
      return {
        success: true as const,
        taskId: id,
        campaignId: existing.campaignId ?? undefined,
        contentId: existing.contentId ?? undefined,
        groupId: existing.groupId ?? undefined,
        packageId: existing.packageId,
        status: existing.status,
        publishedAt: existing.publishedAt ?? undefined,
        fallbackPackageId: existing.fallbackPackageId ?? undefined
      };
    }

    sets.push('"updatedAt" = ?');
    params.push(toSqliteDateTime());
    // Pin status so a concurrent publish cannot lose the freeze gate (TOCTOU).
    params.push(id, existing.status);

    // Residual #165: SPA form discards body + reloads list — drop the full-row
    // response payload; changed-rows is the existence/freeze probe (parity with #163/#164).
    // publish/schedule still hydrate free-form columns for SPA detail body reuse.
    const changed = Number(
      (await this.prisma.$executeRawUnsafe(
        `UPDATE "DistributionTask" SET ${sets.join(', ')} WHERE "taskId" = ? AND "status" = ?`,
        ...params
      )) ?? 0
    );
    if (changed <= 0) {
      // Residual #129: failure arm only needs freeze projection fields.
      const latest = await this.getTaskUpdateMeta(id);
      // Re-apply freeze against the new status if schedule/publish/cancel won the race.
      // Must match the pre-check set (publishedAt OR terminal) — missing cancelled/failed/
      // publishedAt made the race error message claim fields were still mutable.
      const nowHasPublishedHistory = Boolean(latest.publishedAt);
      const nowTerminal =
        latest.status === 'published' ||
        latest.status === 'completed' ||
        latest.status === 'overdue' ||
        latest.status === 'cancelled' ||
        latest.status === 'failed';
      const nowFrozen = nowHasPublishedHistory || nowTerminal;
      const nowScheduled = latest.status === 'scheduled' && !nowFrozen;
      if (nowFrozen || nowScheduled) {
        const frozenFields = nowFrozen
          ? ([
              'packageId',
              'channel',
              'contentId',
              'body',
              'title',
              'cta',
              'campaignId',
              'groupId',
              'fallbackPackageId',
              'plannedAt'
            ] as const)
          : ([
              'packageId',
              'channel',
              'fallbackPackageId',
              'contentId',
              'body',
              'title',
              'cta',
              'campaignId',
              'groupId'
            ] as const);
        const attempted = frozenFields.filter((f) => dto[f] !== undefined);
        if (attempted.length) {
          throw new BadRequestException(
            `任务状态为 '${latest.status}'，不可修改: ${attempted.join(', ')}`
          );
        }
      }
      throw new BadRequestException(`任务状态已变更（当前 '${latest.status}'），请刷新后重试`);
    }
    // Residual #165: slim shell from freeze projection + dto overlays (SPA discards body).
    return {
      success: true as const,
      taskId: id,
      campaignId:
        dto.campaignId !== undefined
          ? (dto.campaignId ?? undefined)
          : (existing.campaignId ?? undefined),
      contentId:
        dto.contentId !== undefined
          ? (dto.contentId ?? undefined)
          : (existing.contentId ?? undefined),
      groupId:
        dto.groupId !== undefined ? (dto.groupId ?? undefined) : (existing.groupId ?? undefined),
      packageId: dto.packageId ?? existing.packageId,
      status: existing.status,
      publishedAt: existing.publishedAt ?? undefined,
      fallbackPackageId:
        dto.fallbackPackageId !== undefined
          ? (dto.fallbackPackageId ?? undefined)
          : (existing.fallbackPackageId ?? undefined)
    };
  }

  /** Statuses that may be hard-deleted (no attribution/visit cascade risk). */
  private static readonly DELETABLE_STATUSES = new Set([
    'draft',
    'cancelled',
    'failed',
    'blocked',
    'waiting_audit'
  ]);

  async delete(
    id: string,
    preloadedMeta?: { packageId: string; status: string; publishedAt: string | null }
  ) {
    // Residual #107: status + publishedAt only — delete never needs executions/body.
    // Residual #159: controller may pass meta from the same probe used for scope.
    const task = preloadedMeta ?? (await this.getTaskDeleteMeta(id));
    if (!DistributionTaskService.DELETABLE_STATUSES.has(task.status)) {
      throw new BadRequestException(
        `Cannot delete task with status '${task.status}'. Cancel it first, or only delete draft/cancelled/failed tasks.`
      );
    }
    // Pre-check publishedAt for a clearer error before the atomic delete.
    if (task.publishedAt) {
      throw new BadRequestException(
        'Cannot delete a task that was published; keep it cancelled as a tombstone'
      );
    }
    // Atomic delete: pin status + zero refs so concurrent bind/visit/publish cannot
    // leave orphans or wipe history between COUNT and DELETE.
    const changed = Number(
      (await this.prisma.$executeRawUnsafe(
        `DELETE FROM "DistributionTask"
         WHERE "taskId" = ?
           AND "status" = ?
           AND "publishedAt" IS NULL
           AND NOT EXISTS (SELECT 1 FROM "OrderAttribution" WHERE "taskId" = ?)
           AND NOT EXISTS (SELECT 1 FROM "TrackingVisit" WHERE "taskId" = ?)`,
        id,
        task.status,
        id,
        id
      )) ?? 0
    );
    if (changed <= 0) {
      const latest = await this.getTaskDeleteMeta(id);
      if (!DistributionTaskService.DELETABLE_STATUSES.has(latest.status)) {
        throw new BadRequestException(
          `Cannot delete task with status '${latest.status}'. Cancel it first, or only delete draft/cancelled/failed tasks.`
        );
      }
      if (latest.publishedAt) {
        throw new BadRequestException(
          'Cannot delete a task that was published; keep it cancelled as a tombstone'
        );
      }
      throw new BadRequestException(
        'Cannot delete task with attribution or visit history; keep it cancelled as a tombstone'
      );
    }
    return { success: true };
  }

  async publish(
    id: string,
    dto: PublishTaskDto & { operatorId?: string; operatorName?: string },
    preloadedTask?: Awaited<ReturnType<DistributionTaskService['getTaskRow']>>
  ) {
    // Residual #107: full row without executions (title/body/contentId needed).
    // Residual #156: controller may pass row from the same probe used for scope.
    const task = preloadedTask ?? (await this.getTaskRow(id));
    if (task.status !== 'scheduled') {
      throw new BadRequestException(
        `Cannot publish task with status '${task.status}'. Only 'scheduled' tasks can be published.`
      );
    }

    // Publish integrity:
    // 1) bound contentId → must still be approved; re-stamp title/body/cta from copy
    //    so operators cannot launder free-form text under an approved contentId
    // 2) free-form body (no contentId) → machine-audit against package; reject high risk
    let publishTitle: string | null = task.title ?? null;
    let publishBody: string | null = task.body ?? null;
    let publishCta: string | null = task.cta ?? null;

    if (task.contentId) {
      const copies = await this.prisma.$queryRawUnsafe<
        Array<{
          contentId: string;
          packageId: string | null;
          auditStatus: string;
          title: string | null;
          body: string | null;
          cta: string | null;
        }>
      >(
        `SELECT "contentId", "packageId", "auditStatus", "title", "body", "cta"
         FROM "GeneratedCopy" WHERE "contentId" = ? LIMIT 1`,
        task.contentId
      );
      if (!copies.length) {
        throw new BadRequestException(`发布失败：绑定文案不存在 (${task.contentId})`);
      }
      if (String(copies[0].auditStatus) !== 'approved') {
        throw new BadRequestException(
          `发布失败：绑定文案审核状态为 '${copies[0].auditStatus}'，仅已通过文案可发布`
        );
      }
      // Defense-in-depth: never open a package-B GMV window under package-A copy
      // even if a pre-freeze row already diverged (or TOCTOU race before freeze).
      if (
        copies[0].packageId &&
        task.packageId &&
        String(copies[0].packageId) !== String(task.packageId)
      ) {
        throw new BadRequestException(
          `发布失败：文案 packageId=${copies[0].packageId} 与任务 packageId=${task.packageId} 不一致`
        );
      }
      // Always ship the approved copy text, not any diverged task fields.
      publishTitle = copies[0].title ?? null;
      publishBody = copies[0].body ?? null;
      publishCta = copies[0].cta ?? null;
      // Re-validate group/campaign liveness at publish (create-time check can go stale).
      await this.assertOptionalTaskFks({
        packageId: task.packageId,
        groupId: task.groupId,
        campaignId: task.campaignId,
        fallbackPackageId: task.fallbackPackageId,
        contentId: task.contentId,
        status: 'scheduled',
        excludeTaskId: id
      });
    } else if (publishTitle || publishBody) {
      // Free-form publish path: still run machine audit so forbidden claims cannot ship.
      // Re-validate group/campaign/package before opening the attribution window.
      await this.assertOptionalTaskFks({
        packageId: task.packageId,
        groupId: task.groupId,
        campaignId: task.campaignId,
        fallbackPackageId: task.fallbackPackageId,
        status: 'scheduled',
        excludeTaskId: id
      });
      // Residual #142: machine audit only needs price/stock/useRules (parity with #133).
      const pkgs = await this.prisma.$queryRawUnsafe<PackageAuditRow[]>(
        `SELECT "originalPrice", "salePrice", "temporarySalePrice",
                "stockTotal", "stockLeft", "useRules"
         FROM "ContentPackage" WHERE "packageId" = ? LIMIT 1`,
        task.packageId
      );
      if (!pkgs.length) {
        throw new BadRequestException(`发布失败：套餐不存在 (${task.packageId})`);
      }
      const pkg = mapPackageForAudit(pkgs[0]);
      const machineAudit = auditCopyText(pkg, {
        title: String(publishTitle ?? ''),
        body: String(publishBody ?? ''),
        strategyType: 'sprint'
      });
      if (machineAudit.riskLevel === 'high') {
        throw new BadRequestException(
          `发布失败：自由文案机审高风险 — ${machineAudit.riskTips.join('；') || '包含禁用表述'}`
        );
      }
    } else {
      // Empty free-form + no contentId used to no-op into published and open GMV window.
      throw new BadRequestException('发布失败：任务缺少 contentId 或 body');
    }

    const now = toSqliteDateTime();
    // Conditional update closes TOCTOU: concurrent publish/fail cannot both succeed.
    // Also re-stamp title/body/cta so published snapshot matches the integrity gate above.
    // Residual #140: UPDATE ... RETURNING hydrates the response in the same trip.
    // Residual #173: list shell (no free-form body/cta/trackingCode) — SPA
    // applyTaskRow merges status fields then refreshTaskTimeline re-GETs detail.
    const returned = await this.prisma.$queryRawUnsafe<TaskRow[]>(
      `UPDATE "DistributionTask"
       SET "status" = 'published',
           "publishedAt" = ?,
           "title" = ?,
           "body" = ?,
           "cta" = ?,
           "updatedAt" = ?
       WHERE "taskId" = ? AND "status" = 'scheduled'
       RETURNING ${TASK_STATUS_MUTATE_COLUMNS}`,
      now,
      publishTitle,
      publishBody,
      publishCta,
      now,
      id
    );
    if (!returned.length) {
      const latestStatus = await this.getTaskStatus(id);
      throw new BadRequestException(
        `Cannot publish task with status '${latestStatus}'. Only 'scheduled' tasks can be published.`
      );
    }

    await this.executionService.create({
      taskId: id,
      action: 'publish',
      operatorId: dto.operatorId,
      operatorName: dto.operatorName,
      evidenceUrl: dto.evidenceUrl,
      note: dto.note
    });

    // Residual #118/#140/#173: list shell only (SPA merge + timeline re-GET).
    return parseTask(returned[0], { includeTrackingCode: false });
  }

  async fail(
    id: string,
    dto: FailTaskDto & { operatorId?: string; operatorName?: string },
    preloadedStatus?: string
  ) {
    // Residual #107/#151: status-only gate; controller may preload via access meta.
    const currentStatus = preloadedStatus ?? (await this.getTaskStatus(id));
    if (currentStatus !== 'scheduled') {
      throw new BadRequestException(
        `Cannot fail task with status '${currentStatus}'. Only 'scheduled' tasks can be marked as failed.`
      );
    }

    const now = toSqliteDateTime();
    // Residual #140/#146: UPDATE ... RETURNING list shell (no free-form body/cta).
    const returned = await this.prisma.$queryRawUnsafe<TaskRow[]>(
      `UPDATE "DistributionTask" SET "status" = 'failed', "updatedAt" = ?
       WHERE "taskId" = ? AND "status" = 'scheduled'
       RETURNING ${TASK_STATUS_MUTATE_COLUMNS}`,
      now,
      id
    );
    if (!returned.length) {
      const latestStatus = await this.getTaskStatus(id);
      throw new BadRequestException(
        `Cannot fail task with status '${latestStatus}'. Only 'scheduled' tasks can be marked as failed.`
      );
    }

    await this.executionService.create({
      taskId: id,
      action: 'confirm_fail',
      operatorId: dto.operatorId,
      operatorName: dto.operatorName,
      evidenceUrl: dto.evidenceUrl,
      failReason: dto.failReason,
      failCategory: dto.failCategory,
      note: dto.note
    });

    // Residual #116/#140/#146: status shell only — SPA merge-preserves free-form fields.
    return parseTask(returned[0], { includeTrackingCode: false });
  }

  async cancel(id: string, reason?: string, preloadedStatus?: string) {
    // Residual #107/#151: status-only gate + pin; controller may preload.
    const currentStatus = preloadedStatus ?? (await this.getTaskStatus(id));
    if (!canTransition(currentStatus, 'cancelled')) {
      throw new BadRequestException(`Cannot cancel task with status '${currentStatus}'.`);
    }

    const now = toSqliteDateTime();
    // Pin from-status so a concurrent publish cannot be overwritten by cancel mid-flight.
    // Residual #140/#146: UPDATE ... RETURNING list shell (no free-form body/cta).
    const returned = await this.prisma.$queryRawUnsafe<TaskRow[]>(
      `UPDATE "DistributionTask" SET "status" = 'cancelled', "cancelReason" = ?, "updatedAt" = ?
       WHERE "taskId" = ? AND "status" = ?
       RETURNING ${TASK_STATUS_MUTATE_COLUMNS}`,
      reason ?? null,
      now,
      id,
      currentStatus
    );
    if (!returned.length) {
      const latestStatus = await this.getTaskStatus(id);
      throw new BadRequestException(`Cannot cancel task with status '${latestStatus}'.`);
    }

    await this.executionService.create({
      taskId: id,
      action: 'cancel',
      note: reason
    });

    // Residual #116/#140/#146: status shell only — SPA merge-preserves free-form fields.
    return parseTask(returned[0], { includeTrackingCode: false });
  }

  /**
   * Promote draft / waiting_audit / blocked → scheduled.
   * Requires plannedAt and (when contentId set) approved copy so publish path is intact.
   */
  async schedule(
    id: string,
    plannedAt: string,
    preloadedTask?: Awaited<ReturnType<DistributionTaskService['getTaskRow']>>
  ) {
    // Residual #107: row without executions (contentId/body/FKs needed for re-check).
    // Residual #156: controller may pass row from the same probe used for scope.
    const task = preloadedTask ?? (await this.getTaskRow(id));
    if (!canTransition(task.status, 'scheduled')) {
      throw new BadRequestException(
        `Cannot schedule task with status '${task.status}'. Allowed: draft/waiting_audit/blocked.`
      );
    }
    if (!plannedAt) {
      throw new BadRequestException('status=scheduled 时必须提供 plannedAt');
    }
    const planned = normalizePlannedAt(plannedAt);
    if (!planned) {
      throw new BadRequestException('plannedAt 无效');
    }

    // Re-check content + group/campaign/package FKs so disabled/retargeted community
    // cannot still be scheduled after create-time validation went stale.
    if (task.contentId) {
      await this.assertOptionalTaskFks({
        contentId: task.contentId,
        packageId: task.packageId,
        groupId: task.groupId,
        campaignId: task.campaignId,
        fallbackPackageId: task.fallbackPackageId,
        status: 'scheduled',
        excludeTaskId: id
      });
    } else if (!task.body?.trim()) {
      throw new BadRequestException('调度失败：任务缺少 contentId 或 body');
    } else {
      // Free-form schedule still needs live group/campaign/package geography.
      await this.assertOptionalTaskFks({
        packageId: task.packageId,
        groupId: task.groupId,
        campaignId: task.campaignId,
        fallbackPackageId: task.fallbackPackageId,
        status: 'scheduled',
        excludeTaskId: id
      });
    }

    const fromStatus = task.status;
    const now = toSqliteDateTime();
    // Residual #140: UPDATE ... RETURNING — drop post-write getTaskRow.
    // Residual #173: list shell (parity with fail/cancel/complete) — no free-form
    // body/cta/trackingCode. SPA merge-preserves free-form fields.
    const returned = await this.prisma.$queryRawUnsafe<TaskRow[]>(
      `UPDATE "DistributionTask"
       SET "status" = 'scheduled', "plannedAt" = ?, "updatedAt" = ?
       WHERE "taskId" = ? AND "status" = ?
       RETURNING ${TASK_STATUS_MUTATE_COLUMNS}`,
      planned,
      now,
      id,
      fromStatus
    );
    if (!returned.length) {
      const latestStatus = await this.getTaskStatus(id);
      throw new BadRequestException(
        `Cannot schedule task with status '${latestStatus}'. Allowed: draft/waiting_audit/blocked.`
      );
    }

    await this.executionService.create({
      taskId: id,
      action: 'schedule',
      note: `plannedAt=${planned}`
    });

    // Residual #118/#140/#173: list shell only (SPA merge-preserves free-form).
    return parseTask(returned[0], { includeTrackingCode: false });
  }

  /** Mark published task as completed (attribution window ended). */
  async complete(id: string, preloadedStatus?: string) {
    // Residual #107/#151: status-only gate; controller may preload via access meta.
    const currentStatus = preloadedStatus ?? (await this.getTaskStatus(id));
    if (!canTransition(currentStatus, 'completed')) {
      throw new BadRequestException(
        `Cannot complete task with status '${currentStatus}'. Only 'published' tasks can be completed.`
      );
    }

    const now = toSqliteDateTime();
    // Stamp completedAt so KPI/history UIs and future window-end logic can rely
    // on an explicit close time (not only status + updatedAt).
    // Residual #140/#146: UPDATE ... RETURNING list shell (no free-form body/cta).
    const returned = await this.prisma.$queryRawUnsafe<TaskRow[]>(
      `UPDATE "DistributionTask"
       SET "status" = 'completed', "completedAt" = ?, "updatedAt" = ?
       WHERE "taskId" = ? AND "status" = 'published'
       RETURNING ${TASK_STATUS_MUTATE_COLUMNS}`,
      now,
      now,
      id
    );
    if (!returned.length) {
      const latestStatus = await this.getTaskStatus(id);
      throw new BadRequestException(
        `Cannot complete task with status '${latestStatus}'. Only 'published' tasks can be completed.`
      );
    }

    await this.executionService.create({
      taskId: id,
      action: 'complete'
    });

    // Residual #116/#140/#146: status shell only — SPA merge-preserves free-form fields.
    return parseTask(returned[0], { includeTrackingCode: false });
  }

  async reassign(id: string, assigneeId: string, _assigneeName?: string, preloadedStatus?: string) {
    // Residual #107/#151: terminal gate + pin; controller may preload via access meta.
    const currentStatus = preloadedStatus ?? (await this.getTaskStatus(id));
    // Terminal tasks have no operator handoff value; keep audit trail frozen.
    if (
      currentStatus === 'completed' ||
      currentStatus === 'cancelled' ||
      currentStatus === 'failed'
    ) {
      throw new BadRequestException(`Cannot reassign task with status '${currentStatus}'`);
    }
    // Reassign requires a live AppUser — free-form ids must not invent operators.
    const assignee = await this.resolveActiveAssignee(assigneeId);
    if (!assignee) {
      throw new BadRequestException('assigneeId 不能为空');
    }
    const now = toSqliteDateTime();
    // Pin non-terminal status so concurrent cancel/fail/complete cannot be overwritten.
    // Residual #140/#146: UPDATE ... RETURNING list shell (no free-form body/cta).
    const returned = await this.prisma.$queryRawUnsafe<TaskRow[]>(
      `UPDATE "DistributionTask" SET "assigneeId" = ?, "assigneeName" = ?, "updatedAt" = ?
       WHERE "taskId" = ? AND "status" NOT IN ('completed', 'cancelled', 'failed')
       RETURNING ${TASK_STATUS_MUTATE_COLUMNS}`,
      assignee.userId,
      assignee.displayName,
      now,
      id
    );
    if (!returned.length) {
      const latestStatus = await this.getTaskStatus(id);
      throw new BadRequestException(`Cannot reassign task with status '${latestStatus}'`);
    }
    // Residual #116/#140/#146: reassign shell only — SPA merge-preserves free-form fields.
    return parseTask(returned[0], { includeTrackingCode: false });
  }

  async getPerformance(id: string) {
    // Residual #105: controller already getById for package scope; getTaskPerformance
    // aggregates by taskId only. Avoids a second full detail + executions reload.
    return getTaskPerformance(this.prisma, id);
  }

  private generateId(): string {
    return newEntityId('task');
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
   * Resolve assigneeId to a live AppUser. null/empty clears the assignment.
   * Prefer DB displayName/username so free-form assigneeName cannot spoof operators.
   * Residual #123: single-row AppUser probe (not loadTaskFkBatch 6-IN).
   * create/batchCreate still use resolveActiveAssigneeFromMap over shared maps.
   */
  private async resolveActiveAssignee(
    assigneeId: string | null | undefined
  ): Promise<{ userId: string; displayName: string } | null> {
    if (assigneeId == null || String(assigneeId).trim() === '') return null;
    const id = String(assigneeId).trim().slice(0, 64);
    const rows = await this.prisma.$queryRawUnsafe<
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

  private resolveActiveAssigneeFromMap(
    assigneeId: string | null | undefined,
    assignees: Map<string, { userId: string; displayName: string; active: boolean }>
  ): { userId: string; displayName: string } | null {
    if (assigneeId == null || String(assigneeId).trim() === '') return null;
    const id = String(assigneeId).trim().slice(0, 64);
    const row = assignees.get(id);
    if (!row) throw new NotFoundException(`指派用户不存在: ${id}`);
    if (!row.active) throw new BadRequestException(`指派用户已停用: ${id}`);
    return { userId: row.userId, displayName: row.displayName };
  }

  private parseJsonStringArray(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }

  private uniqIds(raw: Array<string | null | undefined>, max = 200): string[] {
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
  private async loadTaskFkBatch(dtos: CreateTaskDto[]): Promise<TaskFkMaps> {
    const packageIds = this.uniqIds([
      ...dtos.map((d) => d.packageId),
      ...dtos.map((d) => d.fallbackPackageId)
    ]);
    const campaignIds = this.uniqIds(dtos.map((d) => d.campaignId));
    const groupIds = this.uniqIds(dtos.map((d) => d.groupId));
    const contentIds = this.uniqIds(dtos.map((d) => d.contentId));
    const assigneeIds = this.uniqIds(dtos.map((d) => d.assigneeId));

    const packages = new Map<string, { packageId: string; areaId: string; merchantId: string }>();
    const campaigns = new Map<
      string,
      { campaignId: string; status: string; areaIds: string | null; merchantIds: string | null }
    >();
    const groups = new Map<string, { groupId: string; isActive: number; areaId: string }>();
    const contents = new Map<
      string,
      { contentId: string; packageId: string; auditStatus: string }
    >();
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
        return this.prisma.$queryRawUnsafe<T[]>(eqSql, ids[0]);
      }
      const ph = ids.map(() => '?').join(',');
      return this.prisma.$queryRawUnsafe<T[]>(sql.replace('__IN__', ph), ...ids);
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
   * Optional FKs (campaign/group/fallback package/content) are free-form strings in the DTO.
   * Reject missing / terminal targets so KPI boards cannot be polluted by phantom ids
   * or tasks bound to completed campaigns, disabled groups, or unapproved copy.
   * Also enforce package existence + geo/merchant consistency:
   *  - group.areaId must equal package.areaId
   *  - campaign areaIds/merchantIds (when non-empty) must cover the package
   *  - fallbackPackage must share package.merchantId
   * When contentId is set, it must be approved and (when packageId known) match the task package.
   */
  private async assertOptionalTaskFks(dto: {
    campaignId?: string | null;
    groupId?: string | null;
    fallbackPackageId?: string | null;
    contentId?: string | null;
    packageId?: string | null;
    /** When waiting_audit, content may be pending; otherwise content must be approved. */
    status?: string | null;
    /** On update, allow re-binding the same contentId to this task. */
    excludeTaskId?: string | null;
  }): Promise<void> {
    // Single-row path: batch-load just this dto's ids (1 round of parallel INs).
    const maps = await this.loadTaskFkBatch([
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
    this.assertOptionalTaskFksFromMaps(dto, maps);
  }

  private assertOptionalTaskFksFromMaps(
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
        const areaIds = this.parseJsonStringArray(camp.areaIds);
        const merchantIds = this.parseJsonStringArray(camp.merchantIds);
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
      if (
        dto.packageId &&
        content.packageId &&
        String(content.packageId) !== String(dto.packageId)
      ) {
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
}

/** Batch FK maps for task create/batchCreate pre-validate (residual #86). */
type TaskFkMaps = {
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
