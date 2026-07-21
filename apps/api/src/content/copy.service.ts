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
import { resolvePagination, describeError } from '@content/shared';
import { auditCopyText, generateTemplateCopies } from '../domain/copy-rules';
import { buildPromotionScore } from '../domain/promotion-rules';
import { getFallbackDate } from '../domain/utils';
import { PrismaService } from '../prisma/prisma.service';
import { DataSourceService } from './data-source.service';
import { PackageDetailService } from './package-detail';
import { AICopyService } from './ai-copy';
import { copyToDb, joinList, mapCopy, mapPackage, packageToDb } from './mappers';
import { resolvePackageAndSnapshot } from './package-detail-helpers';

@Injectable()
export class CopyService {
  private readonly logger = new Logger(CopyService.name);

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

  /** 确保套餐已持久化到 DB */
  private async ensurePackagePersisted(pkg: ContentPackage): Promise<void> {
    const data = packageToDb(pkg);
    await this.prisma.contentPackage.upsert({
      where: { packageId: pkg.packageId },
      update: data,
      create: data
    });
  }

  async generateCopies(request: GenerateCopyRequest): Promise<GenerateCopiesResponse> {
    if (!request.packageId || !request.channel) {
      throw new BadRequestException('packageId、channel 必填');
    }
    const normalizedRequest: GenerateCopyRequest = {
      ...request,
      scenario: request.scenario?.trim() || '日常运营推荐',
      tone: request.tone?.trim() || '真实运营口吻',
      copyCount: Number(request.copyCount || 3)
    };

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
    filters: { auditStatus?: AuditStatus; channel?: Channel },
    page?: number,
    pageSize?: number
  ): Promise<CopiesResponse> {
    const { offset, ...pagination } = resolvePagination(page, pageSize, 0);

    const [rows, total] = await Promise.all([
      this.prisma.generatedCopy.findMany({
        where: { auditStatus: filters.auditStatus, channel: filters.channel },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: pagination.pageSize
      }),
      this.prisma.generatedCopy.count({
        where: { auditStatus: filters.auditStatus, channel: filters.channel }
      })
    ]);

    // 拿到真实 total 后重新计算 totalPages
    const finalPagination = resolvePagination(page, pageSize, total);
    return {
      items: rows.map(mapCopy),
      pagination: {
        page: finalPagination.page,
        pageSize: finalPagination.pageSize,
        total,
        totalPages: finalPagination.totalPages
      }
    };
  }

  async auditCopy(
    contentId: string,
    request: AuditCopyRequest
  ): Promise<GeneratedCopy & { distributionTaskId?: string }> {
    const row = await this.prisma.generatedCopy.findUnique({ where: { contentId } });
    if (!row) throw new NotFoundException('文案不存在');

    const packageRow = await this.prisma.contentPackage.findUnique({
      where: { packageId: row.packageId }
    });
    if (!packageRow) throw new NotFoundException(`套餐不存在: ${row.packageId}`);

    const pkg = mapPackage(packageRow);
    const title = request.title ?? row.title;
    const body = request.body ?? row.body;
    const machineAudit = auditCopyText(pkg, {
      title,
      body,
      strategyType: row.strategyType as GeneratedCopy['strategyType']
    });
    const finalStatus =
      machineAudit.riskLevel === 'high' && request.auditStatus === 'approved'
        ? 'risk'
        : request.auditStatus;

    // Increment versionNo per packageId+channel
    const latestVersion = await this.prisma.generatedCopy.count({
      where: { packageId: row.packageId, channel: row.channel }
    });

    const updated = await this.prisma.generatedCopy.update({
      where: { contentId },
      data: {
        title,
        body,
        auditStatus: finalStatus,
        auditRemark:
          request.auditRemark ??
          (machineAudit.riskTips.length > 0 ? machineAudit.riskTips.join('；') : null),
        riskLevel: machineAudit.riskLevel,
        riskTips: joinList(machineAudit.riskTips),
        versionNo: latestVersion + 1
      }
    });

    const result = mapCopy(updated);

    // Auto-create DistributionTask when approved
    let distributionTaskId: string | undefined;
    if (finalStatus === 'approved') {
      const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      try {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO "DistributionTask" ("taskId", "contentId", "packageId", "channel", "title", "body", "cta", "status", "createdAt", "updatedAt")
           VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', datetime('now'), datetime('now'))`,
          taskId,
          contentId,
          row.packageId,
          row.channel,
          title,
          body,
          row.cta
        );
        distributionTaskId = taskId;
      } catch (err: unknown) {
        this.logger.warn(`Auto-create task failed for copy ${contentId}: ${describeError(err)}`);
      }
    }

    return { ...result, distributionTaskId };
  }
}
