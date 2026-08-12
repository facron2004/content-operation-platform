import { Inject, Injectable } from '@nestjs/common';
import { GmvService } from '../gmv/gmv.service';
import { OverviewService } from '../overview/overview.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildWorkbenchPendingItems,
  type OperationWorkbenchPayload,
  type WorkbenchPendingCounts
} from './operation-workbench.types';

@Injectable()
export class OperationWorkbenchService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GmvService) private readonly gmv: GmvService,
    @Inject(OverviewService) private readonly overview: OverviewService
  ) {}

  async getWorkbench(date?: string): Promise<OperationWorkbenchPayload> {
    const [gmv, trend, catalog, pendingCounts] = await Promise.all([
      this.gmv.getKpis(date),
      this.gmv.getTrend(7, date),
      this.overview.getKpis(date),
      this.loadPendingCounts()
    ]);

    const pending = buildWorkbenchPendingItems({
      ...pendingCounts,
      staleSkuCount: catalog.zeroSalesSkuCount
    });

    return {
      date: gmv.date,
      updatedAt: new Date().toISOString(),
      dataSources: [...new Set([gmv.dataSource, catalog.dataSource])],
      kpis: {
        gmv,
        catalog: {
          totalMerchants: catalog.totalMerchants,
          totalSkus: catalog.totalSkus,
          zeroSalesMerchants: catalog.zeroSalesMerchants,
          zeroSalesSkuCount: catalog.zeroSalesSkuCount,
          zeroSalesSkuRatio: catalog.zeroSalesSkuRatio,
          dataSource: catalog.dataSource
        }
      },
      trend,
      pending: {
        total: pending.reduce((total, item) => total + item.count, 0),
        items: pending,
        sources: ['MarketingCampaign', 'DistributionTask', 'JobRun', 'OutboxEvent']
      }
    };
  }

  private async loadPendingCounts(): Promise<Omit<WorkbenchPendingCounts, 'staleSkuCount'>> {
    const [draftCampaigns, scheduledTasks, failedTasks, pendingOutbox, failedJobs] =
      await Promise.all([
        this.prisma.marketingCampaign.count({ where: { status: 'draft' } }),
        this.prisma.distributionTask.count({ where: { status: 'scheduled' } }),
        this.prisma.distributionTask.count({ where: { status: 'failed' } }),
        this.prisma.outboxEvent.count({ where: { status: 'pending' } }),
        this.prisma.jobRun.count({ where: { status: 'failed' } })
      ]);

    return { draftCampaigns, scheduledTasks, failedTasks, pendingOutbox, failedJobs };
  }
}
