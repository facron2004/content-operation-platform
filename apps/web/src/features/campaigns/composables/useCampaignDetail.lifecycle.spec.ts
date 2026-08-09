import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import type {
  CampaignPerformanceResponse,
  DistributionTask,
  MarketingCampaign,
  TaskListResponse
} from '@content/shared';

const mocks = vi.hoisted(() => ({
  getCampaign: vi.fn(),
  getCampaignPerformance: vi.fn(),
  listTasks: vi.fn(),
  startCampaign: vi.fn(),
  pauseCampaign: vi.fn(),
  completeCampaign: vi.fn(),
  cancelCampaign: vi.fn(),
  error: vi.fn(),
  success: vi.fn()
}));

vi.mock('element-plus', () => ({
  ElMessage: {
    error: mocks.error,
    success: mocks.success
  },
  ElMessageBox: {
    confirm: vi.fn()
  }
}));

vi.mock('../../../services/api', () => ({
  api: {
    getCampaign: mocks.getCampaign,
    getCampaignPerformance: mocks.getCampaignPerformance,
    listTasks: mocks.listTasks,
    startCampaign: mocks.startCampaign,
    pauseCampaign: mocks.pauseCampaign,
    completeCampaign: mocks.completeCampaign,
    cancelCampaign: mocks.cancelCampaign
  }
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { useCampaignDetail } from './useCampaignDetail';

function performanceFor(): CampaignPerformanceResponse {
  return {
    totalTasks: 1,
    completedTasks: 0,
    failedTasks: 0,
    totalGmv: 0,
    totalOrders: 0,
    dateFrom: '2026-08-01',
    dateTo: '2026-08-31'
  };
}

function taskFor(taskId: string): DistributionTask {
  return {
    taskId,
    campaignId: 'campaign-1',
    packageId: 'package-1',
    channel: 'wechat_group',
    status: 'draft',
    priority: 'normal',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z'
  };
}

function taskPageFor(items: DistributionTask[]): TaskListResponse {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 10,
    dateFrom: '2026-08-01',
    dateTo: '2026-08-31'
  };
}

function campaignFor(): MarketingCampaign {
  return {
    campaignId: 'campaign-1',
    name: '活动 A',
    campaignType: 'daily',
    status: 'draft',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    areaIds: ['area-1'],
    budget: 100,
    targetGmv: 1000,
    targetOrders: 10,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z'
  };
}

describe('Campaign detail read error lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps the last task page during failure and clears the error after retry', async () => {
    mocks.listTasks
      .mockResolvedValueOnce(taskPageFor([taskFor('task-1')]))
      .mockRejectedValueOnce(new Error('tasks unavailable'))
      .mockResolvedValueOnce(taskPageFor([taskFor('task-2')]));
    scope = effectScope();
    const detail = scope.run(() => useCampaignDetail('campaign-1'))!;

    await detail.loadTasks();
    await detail.loadTasks();
    expect(detail.tasksError.value).toBe('活动任务加载失败，请稍后重试');
    expect(detail.tasks.value[0]?.taskId).toBe('task-1');

    await detail.loadTasks();
    expect(detail.tasksError.value).toBeNull();
    expect(detail.tasks.value[0]?.taskId).toBe('task-2');
  });

  it('exposes the primary detail failure as persistent page state', async () => {
    mocks.getCampaign.mockRejectedValueOnce(new Error('campaign unavailable'));
    mocks.getCampaignPerformance.mockResolvedValue(performanceFor());
    mocks.listTasks.mockResolvedValue(taskPageFor([]));
    scope = effectScope();
    const detail = scope.run(() => useCampaignDetail('campaign-1'))!;

    await detail.loadDetail();

    expect(detail.loadError.value).toBe('加载活动详情失败');
    expect(mocks.error).toHaveBeenCalledWith('加载活动详情失败');
  });

  it('keeps a detail action failure visible and clears it after a successful retry', async () => {
    mocks.startCampaign
      .mockRejectedValueOnce(new Error('start unavailable'))
      .mockResolvedValueOnce({
        campaignId: 'campaign-1',
        status: 'active'
      });
    scope = effectScope();
    const detail = scope.run(() => useCampaignDetail('campaign-1'))!;
    detail.campaign.value = campaignFor();

    await detail.startCampaign();

    expect(detail.actionError.value).toBe('启动活动失败');
    expect(detail.actionLoading.value).toBe(false);
    expect(mocks.error).toHaveBeenCalledWith('启动活动失败');

    await detail.startCampaign();

    expect(detail.actionError.value).toBeNull();
    expect(mocks.success).toHaveBeenCalledWith('活动已启动');
    expect(mocks.startCampaign).toHaveBeenCalledWith('campaign-1', '2026-08-09T00:00:00.000Z');
  });

  it('blocks duplicate detail actions and suppresses late feedback after scope disposal', async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise<unknown>((resolvePromise) => {
      resolve = resolvePromise;
    });
    mocks.startCampaign.mockReturnValue(pending);
    scope = effectScope();
    const detail = scope.run(() => useCampaignDetail('campaign-1'))!;
    detail.campaign.value = campaignFor();

    const first = detail.startCampaign();
    const duplicate = detail.startCampaign();
    await duplicate;
    expect(mocks.startCampaign).toHaveBeenCalledTimes(1);

    scope.stop();
    resolve({ campaignId: 'campaign-1', status: 'active' });
    await first;

    expect(detail.actionLoading.value).toBe(false);
    expect(detail.actionError.value).toBeNull();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });
});
