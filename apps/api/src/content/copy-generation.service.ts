import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  ContentPackage,
  GenerateCopiesResponse,
  GenerateCopyRequest,
  SalesSnapshot
} from '@content/shared';
import { describeError } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import { buildPromotionScore } from '../domain/promotion-rules';
import { getFallbackDate } from '../domain/utils';
import { copyToDb, packageToDb } from './mappers';
import { DataSourceService } from './data-source.service';
import { PackageDetailService } from './package-detail';
import { AICopyService } from './ai-copy';
import { generateTemplateCopies } from '../domain/copy-rules';
import { resolvePackageAndSnapshot } from './package-detail-helpers';

@Injectable()
export class CopyGenerationService {
  private readonly logger = new Logger(CopyGenerationService.name);

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
}
