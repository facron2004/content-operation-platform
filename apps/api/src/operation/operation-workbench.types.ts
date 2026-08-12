import type { GmvTodayPayload, GmvTrendPoint } from '../gmv/gmv.dto';

export type WorkbenchPendingTone = 'warning' | 'danger' | 'info';

export interface WorkbenchPendingItem {
  key: string;
  label: string;
  description: string;
  count: number;
  route: string;
  tone: WorkbenchPendingTone;
}

export interface WorkbenchPendingCounts {
  draftCampaigns: number;
  scheduledTasks: number;
  failedTasks: number;
  pendingOutbox: number;
  failedJobs: number;
  staleSkuCount: number;
}

export interface OperationWorkbenchPayload {
  date: string;
  updatedAt: string;
  dataSources: string[];
  kpis: {
    gmv: GmvTodayPayload;
    catalog: {
      totalMerchants: number;
      totalSkus: number;
      zeroSalesMerchants: number;
      zeroSalesSkuCount: number;
      zeroSalesSkuRatio: number;
      dataSource: string;
    };
  };
  trend: GmvTrendPoint[];
  pending: {
    total: number;
    items: WorkbenchPendingItem[];
    sources: string[];
  };
}

function safeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function buildWorkbenchPendingItems(counts: WorkbenchPendingCounts): WorkbenchPendingItem[] {
  const candidates: WorkbenchPendingItem[] = [
    {
      key: 'inventory-warning',
      label: '库存与动销预警',
      description: '超过 30 天未动销的 SKU',
      count: safeCount(counts.staleSkuCount),
      route: '/zero-sales',
      tone: 'warning'
    },
    {
      key: 'campaign-draft',
      label: '活动待配置',
      description: '仍处于草稿状态的营销活动',
      count: safeCount(counts.draftCampaigns),
      route: '/campaigns',
      tone: 'info'
    },
    {
      key: 'scheduled-task',
      label: '触达任务待执行',
      description: '已排期但尚未完成的分发任务',
      count: safeCount(counts.scheduledTasks),
      route: '/tasks',
      tone: 'info'
    },
    {
      key: 'failed-task',
      label: '触达任务失败',
      description: '需要运营重新处理的失败任务',
      count: safeCount(counts.failedTasks),
      route: '/tasks',
      tone: 'danger'
    },
    {
      key: 'failed-job',
      label: '后台任务失败',
      description: '需要平台治理关注的后台任务',
      count: safeCount(counts.failedJobs),
      route: '/audit-logs',
      tone: 'danger'
    },
    {
      key: 'pending-outbox',
      label: '事件待投递',
      description: '等待异步事件处理的业务消息',
      count: safeCount(counts.pendingOutbox),
      route: '/tasks',
      tone: 'warning'
    }
  ];

  return candidates.filter((item) => item.count > 0);
}
