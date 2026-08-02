import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { auditCopyText } from '../../domain/copy-rules';
import { mapPackageForAudit, type PackageAuditRow } from '../../content/mappers';
import { getStatus } from '../repositories/task.repository';
import { transitionPublished, transitionFail } from '../domain/task-status-machine';
import { findTaskRow, parseTask } from '../distribution-task-query';
import { PublishTaskDto } from '../dto/publish-task.dto';
import { FailTaskDto } from '../dto/fail-task.dto';

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
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
        Array<{ title: string | null; body: string | null; cta: string | null }>
      >(
        `SELECT "title", "body", "cta" FROM "GeneratedCopy"
         WHERE "contentId" = ? AND "auditStatus" = 'approved'
         LIMIT 1`,
        task.contentId
      );
      if (!copies.length) {
        throw new BadRequestException(`发布失败：文案 ${task.contentId} 未审核或审核未通过`);
      }
      publishTitle = copies[0].title ?? null;
      publishBody = copies[0].body ?? null;
      publishCta = copies[0].cta ?? null;

      // Re-validate FK liveness at publish
      await this.assertFkLive({
        packageId: task.packageId,
        groupId: task.groupId,
        campaignId: task.campaignId,
        fallbackPackageId: task.fallbackPackageId,
        contentId: task.contentId,
        excludeTaskId: id
      });
    } else if (publishTitle || publishBody) {
      publishTitle = task.title ?? null;
      publishBody = task.body ?? null;
      await this.assertFkLive({
        packageId: task.packageId,
        groupId: task.groupId,
        campaignId: task.campaignId,
        fallbackPackageId: task.fallbackPackageId,
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

    const returned = await transitionPublished(
      this.prisma,
      id,
      publishTitle,
      publishBody,
      publishCta
    );
    if (!returned) {
      const latestStatus = await getStatus(this.prisma, id);
      throw new BadRequestException(
        `Cannot publish task with status '${latestStatus}'. Only 'scheduled' tasks can be published.`
      );
    }

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

    return parseTask(returned, { includeTrackingCode: false });
  }

  private async prepublishLoad(id: string) {
    const row = await findTaskRow(this.prisma, id);
    if (!row) throw new NotFoundException('Distribution task not found');
    const { packageGeo: _packageGeo, ...task } = row;
    return task;
  }

  private async assertFkLive(args: {
    packageId: string;
    groupId?: string | null;
    campaignId?: string | null;
    fallbackPackageId?: string | null;
    contentId?: string | null;
    excludeTaskId?: string;
  }): Promise<void> {
    const { packageId, groupId, campaignId, fallbackPackageId, contentId } = args;

    if (packageId) {
      const pkgs = await this.prisma.$queryRawUnsafe<Array<{ packageId: string }>>(
        `SELECT "packageId" FROM "ContentPackage" WHERE "packageId" = ? LIMIT 1`,
        packageId
      );
      if (!pkgs.length) throw new NotFoundException(`套餐不存在: ${packageId}`);
    }
    if (campaignId) {
      const camps = await this.prisma.$queryRawUnsafe<
        Array<{ campaignId: string; status: string }>
      >(
        `SELECT "campaignId", "status" FROM "MarketingCampaign" WHERE "campaignId" = ? LIMIT 1`,
        campaignId
      );
      if (!camps.length) throw new NotFoundException(`活动不存在: ${campaignId}`);
      if (!['draft', 'active', 'paused'].includes(camps[0].status)) {
        throw new BadRequestException(`活动状态为 '${camps[0].status}'，不可绑定新任务`);
      }
    }
    if (groupId) {
      const groups = await this.prisma.$queryRawUnsafe<
        Array<{ groupId: string; isActive: number }>
      >(`SELECT "groupId", "isActive" FROM "CommunityGroup" WHERE "groupId" = ? LIMIT 1`, groupId);
      if (!groups.length) throw new NotFoundException(`社群不存在: ${groupId}`);
      if (Number(groups[0].isActive) !== 1) {
        throw new BadRequestException(`社群已停用，不可绑定新任务`);
      }
    }
    if (fallbackPackageId) {
      const fb = await this.prisma.$queryRawUnsafe<Array<{ packageId: string }>>(
        `SELECT "packageId" FROM "ContentPackage" WHERE "packageId" = ? LIMIT 1`,
        fallbackPackageId
      );
      if (!fb.length) throw new NotFoundException(`兜底套餐不存在: ${fallbackPackageId}`);
    }
    if (contentId) {
      const contents = await this.prisma.$queryRawUnsafe<
        Array<{ contentId: string; auditStatus: string; packageId: string }>
      >(
        `SELECT "contentId", "auditStatus", "packageId" FROM "GeneratedCopy" WHERE "contentId" = ? LIMIT 1`,
        contentId
      );
      if (!contents.length) throw new NotFoundException(`文案不存在: ${contentId}`);
    }
  }
}
