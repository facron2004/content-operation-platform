import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AuditCopyRequest, GeneratedCopy } from '@content/shared';
import { describeError } from '@content/shared';
import { newEntityId } from '../common/id';
import { allocateTrackingCode } from '../common/tracking-code';
import { toSqliteDateTime } from '../common/sqlite-datetime';
import { auditCopyText } from '../domain/copy-rules';
import { PrismaService } from '../prisma/prisma.service';
import { joinList, mapPackageForAudit, PACKAGE_AUDIT_SELECT } from './mappers';

export type CopyAuditRequest = AuditCopyRequest & { mintDistributionTask?: boolean };

export type CopyAuditResult = {
  success: true;
  contentId: string;
  packageId: string;
  channel: string;
  auditStatus: string;
  distributionTaskId?: string;
};

@Injectable()
export class CopyAuditService {
  private readonly logger = new Logger(CopyAuditService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Residual #114: optional `preloaded` (controller getCopy) skips the pre-check
   * findUnique so audit is one full-row read for scope + gates. Two-arg form still
   * loads once for unit tests / internal callers. Post-write re-read unchanged.
   */
  async auditCopy(
    contentId: string,
    request: CopyAuditRequest,
    preloaded?: GeneratedCopy
  ): Promise<CopyAuditResult> {
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
        await this.prisma.$executeRawUnsafe(
          `UPDATE "DistributionTask"
           SET "status" = 'draft', "title" = ?, "body" = ?, "cta" = ?, "updatedAt" = ?
           WHERE "taskId" = ? AND "status" = 'waiting_audit'`,
          input.title,
          input.body,
          input.cta,
          now,
          existing[0].taskId
        );
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
    } catch (error: unknown) {
      // Only a unique collision means another approve inserted first (or a
      // cancelled twin still holds the deterministic PK). Locks, connection
      // failures and schema errors must not be mistaken for a race and retried
      // with another write.
      const message = describeError(error);
      if (
        !/UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE|P2002|unique constraint/i.test(message)
      ) {
        throw error;
      }
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
