import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DistributionExecutionService } from '../distribution-execution.service';
import { auditCopyText } from '../../domain/copy-rules';
import { mapPackageForAudit, type PackageAuditRow } from '../../content/mappers';
import { getStatus } from '../repositories/task.repository';
import { transitionPublished, transitionFail } from '../domain/task-status-machine';
import { findTaskRow, parseTask } from '../distribution-task-query';
import { assertOptionalTaskFks } from '../distribution-task-fk';
import { PublishTaskDto } from '../dto/publish-task.dto';
import { FailTaskDto } from '../dto/fail-task.dto';
import { OutboxService } from '../../outbox/outbox.service';
import type { Tx } from '../repositories/task.repository';

type PreloadedPublishTask = {
  status: string;
  title?: string | null;
  body?: string | null;
  cta?: string | null;
  contentId?: string | null;
  packageId: string;
  groupId?: string | null;
  campaignId?: string | null;
  fallbackPackageId?: string | null;
};

@Injectable()
export class PublishTaskService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DistributionExecutionService)
    private readonly executionService: DistributionExecutionService,
    @Inject(OutboxService) private readonly outbox?: OutboxService
  ) {}

  async publish(
    id: string,
    dto: PublishTaskDto & { operatorId?: string; operatorName?: string },
    preloadedTask?: PreloadedPublishTask
  ) {
    const task = preloadedTask ?? (await this.prepublishLoad(id));
    if (task.status !== 'scheduled') {
      throw new BadRequestException(
        `Cannot publish task with status '${task.status}'. Only 'scheduled' tasks can be published.`
      );
    }

    let publishTitle: string | null = task.title ?? null;
    let publishBody: string | null = task.body ?? null;
    let publishCta: string | null = task.cta ?? null;

    if (task.contentId) {
      // Copy-approved path: load approved copy
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
      if (
        copies[0].packageId &&
        task.packageId &&
        String(copies[0].packageId) !== String(task.packageId)
      ) {
        throw new BadRequestException(
          `发布失败：文案 packageId=${copies[0].packageId} 与任务 packageId=${task.packageId} 不一致`
        );
      }
      publishTitle = copies[0].title ?? null;
      publishBody = copies[0].body ?? null;
      publishCta = copies[0].cta ?? null;

      // Re-validate FK liveness at publish
      await assertOptionalTaskFks(this.prisma, {
        packageId: task.packageId,
        groupId: task.groupId,
        campaignId: task.campaignId,
        fallbackPackageId: task.fallbackPackageId,
        contentId: task.contentId,
        status: 'scheduled',
        excludeTaskId: id
      });
    } else if (publishTitle || publishBody) {
      publishTitle = task.title ?? null;
      publishBody = task.body ?? null;
      await assertOptionalTaskFks(this.prisma, {
        packageId: task.packageId,
        groupId: task.groupId,
        campaignId: task.campaignId,
        fallbackPackageId: task.fallbackPackageId,
        status: 'scheduled',
        excludeTaskId: id
      });

      const pkgs = await this.prisma.$queryRawUnsafe<PackageAuditRow[]>(
        `SELECT "originalPriceFen", "salePriceFen", "temporarySalePriceFen",
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
      throw new BadRequestException('发布失败：任务缺少 contentId 或 body');
    }

    const returned = await this.commitPublish(id, publishTitle, publishBody, publishCta, dto);
    if (!returned) {
      const latestStatus = await getStatus(this.prisma, id);
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

    return parseTask(returned, { includeTrackingCode: false });
  }

  async fail(
    id: string,
    dto: FailTaskDto & { operatorId?: string; operatorName?: string },
    preloadedStatus?: string
  ) {
    const currentStatus = preloadedStatus ?? (await getStatus(this.prisma, id));
    if (currentStatus !== 'scheduled') {
      throw new BadRequestException(
        `Cannot fail task with status '${currentStatus}'. Only 'scheduled' tasks can be marked as failed.`
      );
    }

    const returned = await transitionFail(this.prisma, id);
    if (!returned) {
      const latestStatus = await getStatus(this.prisma, id);
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

    return parseTask(returned, { includeTrackingCode: false });
  }

  private async prepublishLoad(id: string) {
    const row = await findTaskRow(this.prisma, id);
    if (!row) throw new NotFoundException('Distribution task not found');
    const { packageGeo: _packageGeo, ...task } = row;
    return task;
  }

  private async commitPublish(
    id: string,
    publishTitle: string | null,
    publishBody: string | null,
    publishCta: string | null,
    dto: PublishTaskDto & { operatorId?: string; operatorName?: string }
  ) {
    const execution = {
      taskId: id,
      action: 'publish' as const,
      operatorId: dto.operatorId,
      operatorName: dto.operatorName,
      evidenceUrl: dto.evidenceUrl,
      note: dto.note
    };
    const publish = async (db: Tx) => {
      const returned = await transitionPublished(db, id, publishTitle, publishBody, publishCta);
      if (!returned) return null;

      await this.executionService.create(execution, db);
      if (this.outbox) {
        await this.outbox.publishEvent(db, 'DistributionTask', id, 'task.published', {
          taskId: id,
          operatorId: dto.operatorId ?? null,
          operatorName: dto.operatorName ?? null
        });
      }
      return returned;
    };

    // Real Prisma always exposes $transaction. The fallback keeps lightweight
    // command-service test doubles backwards compatible without weakening the
    // production atomic write path.
    if (typeof this.prisma.$transaction === 'function') {
      return this.prisma.$transaction((tx) => publish(tx));
    }
    const returned = await transitionPublished(
      this.prisma,
      id,
      publishTitle,
      publishBody,
      publishCta
    );
    if (!returned) return null;
    await this.executionService.create(execution);
    if (this.outbox) {
      await this.outbox.publishEvent(this.prisma, 'DistributionTask', id, 'task.published', {
        taskId: id,
        operatorId: dto.operatorId ?? null,
        operatorName: dto.operatorName ?? null
      });
    }
    return returned;
  }
}
