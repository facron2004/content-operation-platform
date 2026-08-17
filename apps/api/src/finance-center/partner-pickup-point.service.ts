import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JobRunnerService } from '../jobs/job-runner.service';
import { PrismaService } from '../prisma/prisma.service';
import { JeeSitePartnerAccountClient } from './jeesite-partner-account.client';
import {
  getActivePersistedOrInMemoryPartnerPickupPointRefreshJob,
  getPartnerPickupPointRefreshJob,
  getPersistedPartnerPickupPointRefreshJob,
  startPartnerPickupPointRefreshJob,
  type PartnerPickupPointRefreshJob
} from './partner-pickup-point-refresh-job';
import type { PartnerPickupPointAggregate } from './partner-pickup-point.mapper';
import type {
  PartnerPickupPointPageView,
  PartnerPickupPointSummaryView
} from './finance-operations.types';
import type { PartnerPickupPointQueryDto } from './finance-operations.dto';

const ACTIVE_STATE_ID = 'active';
const SNAPSHOT_SOURCE = 'JeeSite corePartnerAccountRecord/listData';
const WRITE_BATCH_SIZE = 200;

const centiToString = (value: bigint): string => {
  const whole = value / 100n;
  const fraction = value % 100n;
  if (fraction === 0n) return whole.toString();
  return `${whole.toString()}.${fraction.toString().padStart(2, '0').replace(/0$/, '')}`;
};

@Injectable()
export class PartnerPickupPointService {
  private readonly logger = new Logger(PartnerPickupPointService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional()
    @Inject(JeeSitePartnerAccountClient)
    private readonly client?: JeeSitePartnerAccountClient,
    @Optional() @Inject(JobRunnerService) private readonly jobRunner?: JobRunnerService
  ) {}

  async list(query: PartnerPickupPointQueryDto): Promise<PartnerPickupPointPageView> {
    const state = await this.prisma.partnerPickupPointSnapshotState.findUnique({
      where: { id: ACTIVE_STATE_ID }
    });
    if (!state) return this.emptyPage(query);

    const where: Prisma.PartnerPickupPointSnapshotWhereInput = {
      generation: state.generation
    };
    const skip = (query.page - 1) * query.pageSize;
    const [total, rows, aggregate] = await Promise.all([
      this.prisma.partnerPickupPointSnapshot.count({ where }),
      this.prisma.partnerPickupPointSnapshot.findMany({
        where,
        orderBy: [{ availablePointCenti: 'desc' }, { merchantName: 'asc' }],
        skip,
        take: query.pageSize
      }),
      this.prisma.partnerPickupPointSnapshot.aggregate({
        where,
        _sum: {
          availablePointCenti: true,
          recordCount: true,
          activeRecordCount: true
        }
      })
    ]);

    const summary: PartnerPickupPointSummaryView = {
      merchantCount: total,
      totalRecords: aggregate._sum.recordCount ?? 0,
      activeRecordCount: aggregate._sum.activeRecordCount ?? 0,
      totalAvailablePoint: centiToString(aggregate._sum.availablePointCenti ?? 0n),
      snapshotAt: state.activatedAt.toISOString()
    };
    return {
      items: rows.map((row) => ({
        merchantId: row.merchantId,
        merchantName: row.merchantName,
        availablePoint: centiToString(row.availablePointCenti),
        recordCount: row.recordCount,
        activeRecordCount: row.activeRecordCount
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        hasMore: skip + rows.length < total
      },
      summary,
      dataSources: [SNAPSHOT_SOURCE]
    };
  }

  startRefreshJob(): PartnerPickupPointRefreshJob {
    if (!this.client || !process.env.EXTERNAL_API_BASE_URL) {
      throw new ServiceUnavailableException('外部合作商账户记录数据源未配置，无法刷新提货分');
    }
    return startPartnerPickupPointRefreshJob({
      client: this.client,
      prepareSnapshot: (generation) => this.prepareSnapshot(generation),
      persistSnapshot: (items, generation) => this.persistSnapshot(items, generation),
      finalizeSnapshot: (generation) => this.activateSnapshot(generation),
      discardSnapshot: (generation) => this.discardSnapshot(generation),
      jobRunner: this.jobRunner
    });
  }

  async getActiveRefreshJob(): Promise<PartnerPickupPointRefreshJob | undefined> {
    return getActivePersistedOrInMemoryPartnerPickupPointRefreshJob(this.jobRunner);
  }

  async getRefreshJob(jobId: string): Promise<PartnerPickupPointRefreshJob | undefined> {
    return (
      getPartnerPickupPointRefreshJob(jobId) ??
      (await getPersistedPartnerPickupPointRefreshJob(jobId, this.jobRunner))
    );
  }

  private emptyPage(query: PartnerPickupPointQueryDto): PartnerPickupPointPageView {
    return {
      items: [],
      pagination: { page: query.page, pageSize: query.pageSize, total: 0, hasMore: false },
      summary: {
        merchantCount: 0,
        totalRecords: 0,
        activeRecordCount: 0,
        totalAvailablePoint: '0',
        snapshotAt: null
      },
      dataSources: [SNAPSHOT_SOURCE]
    };
  }

  private async prepareSnapshot(generation: string): Promise<void> {
    await this.prisma.partnerPickupPointSnapshot.deleteMany({ where: { generation } });
  }

  private async discardSnapshot(generation: string): Promise<void> {
    await this.prisma.partnerPickupPointSnapshot.deleteMany({ where: { generation } });
  }

  private async persistSnapshot(
    items: PartnerPickupPointAggregate[],
    generation: string
  ): Promise<{ merchantsPersisted: number; errors: number }> {
    const invalidPointRows = items.reduce((sum, item) => sum + item.invalidPointRows, 0);
    if (invalidPointRows > 0) return { merchantsPersisted: 0, errors: invalidPointRows };

    try {
      for (let offset = 0; offset < items.length; offset += WRITE_BATCH_SIZE) {
        const chunk = items.slice(offset, offset + WRITE_BATCH_SIZE);
        await this.prisma.partnerPickupPointSnapshot.createMany({
          data: chunk.map((item) => ({
            generation,
            merchantId: item.merchantId,
            merchantName: item.merchantName,
            availablePointCenti: item.availablePointCenti,
            recordCount: item.recordCount,
            activeRecordCount: item.activeRecordCount
          }))
        });
      }
      return { merchantsPersisted: items.length, errors: 0 };
    } catch (error: unknown) {
      this.logger.error(`商家提货分 staging 写入失败: ${String(error)}`);
      return { merchantsPersisted: 0, errors: items.length };
    }
  }

  private async activateSnapshot(generation: string): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.partnerPickupPointSnapshot.count({ where: { generation } });
        if (rows === 0) throw new Error('商家提货分 staging 为空，未切换活动快照');
        await tx.partnerPickupPointSnapshotState.upsert({
          where: { id: ACTIVE_STATE_ID },
          create: { id: ACTIVE_STATE_ID, generation },
          update: { generation, activatedAt: new Date() }
        });
      },
      { timeout: 10_000, maxWait: 10_000 }
    );

    try {
      await this.prisma.partnerPickupPointSnapshot.deleteMany({
        where: { generation: { not: generation } }
      });
    } catch (error: unknown) {
      this.logger.warn(`商家提货分旧 staging 清理失败，保留待下次清理: ${String(error)}`);
    }
  }
}
