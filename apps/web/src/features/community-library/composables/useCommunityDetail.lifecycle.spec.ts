import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import type {
  CommunityGroupEntity,
  CommunityPerformanceResponse,
  DistributionTask,
  TaskListResponse
} from '@content/shared';

const mocks = vi.hoisted(() => ({
  getCommunity: vi.fn(),
  getCommunityPerformance: vi.fn(),
  getCommunityTasks: vi.fn(),
  getCommunityRecommendations: vi.fn()
}));

vi.mock('../../../services/api', () => ({
  api: {
    getCommunity: mocks.getCommunity,
    getCommunityPerformance: mocks.getCommunityPerformance,
    getCommunityTasks: mocks.getCommunityTasks,
    getCommunityRecommendations: mocks.getCommunityRecommendations
  }
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { useCommunityDetail } from './useCommunityDetail';

function communityFor(groupId = 'group-1'): CommunityGroupEntity {
  return {
    groupId,
    groupName: '测试社群',
    groupType: 'wechat_group',
    areaId: 'area-1',
    areaName: '测试区域',
    memberCount: 18,
    activityLevel: 'high',
    tags: ['测试'],
    isActive: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z'
  };
}

function performanceFor(): CommunityPerformanceResponse {
  return {
    totalTasks: 1,
    completedTasks: 1,
    failedTasks: 0,
    totalGmv: 100,
    dateFrom: '2026-08-01',
    dateTo: '2026-08-09'
  };
}

function taskFor(taskId: string): DistributionTask {
  return {
    taskId,
    groupId: 'group-1',
    packageId: 'package-1',
    channel: 'wechat_group',
    title: taskId,
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
    dateTo: '2026-08-09'
  };
}

describe('Community detail read error lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    mocks.getCommunity.mockReset();
    mocks.getCommunityPerformance.mockReset();
    mocks.getCommunityTasks.mockReset();
    mocks.getCommunityRecommendations.mockReset();
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('exposes independent errors while retaining the list row as detail fallback', async () => {
    mocks.getCommunity.mockRejectedValueOnce(new Error('detail unavailable'));
    mocks.getCommunityPerformance.mockRejectedValueOnce(new Error('performance unavailable'));
    mocks.getCommunityTasks.mockRejectedValueOnce(new Error('tasks unavailable'));
    mocks.getCommunityRecommendations.mockRejectedValueOnce(new Error('packages unavailable'));
    scope = effectScope();
    const detail = scope.run(() => useCommunityDetail())!;
    const row = communityFor();

    await detail.open(row);

    expect(detail.community.value).toMatchObject(row);
    expect(detail.detailError.value).toBe('社群详情读取失败，请稍后重试');
    expect(detail.performanceError.value).toBe('社群表现加载失败，请稍后重试');
    expect(detail.tasksError.value).toBe('社群任务加载失败，请稍后重试');
    expect(detail.packagesError.value).toBe('社群推荐套餐加载失败，请稍后重试');
  });

  it('keeps the last task page during failure and clears the error after retry', async () => {
    mocks.getCommunity.mockResolvedValue(communityFor());
    mocks.getCommunityPerformance.mockResolvedValue(performanceFor());
    mocks.getCommunityTasks.mockResolvedValueOnce(taskPageFor([taskFor('task-1')]));
    mocks.getCommunityRecommendations.mockResolvedValue({ packages: [] });
    scope = effectScope();
    const detail = scope.run(() => useCommunityDetail())!;
    const row = communityFor();

    await detail.open(row);
    mocks.getCommunityTasks.mockRejectedValueOnce(new Error('tasks unavailable'));
    await detail.loadTasks(row.groupId);

    expect(detail.tasksError.value).toBe('社群任务加载失败，请稍后重试');
    expect(detail.tasks.value[0]?.taskId).toBe('task-1');

    mocks.getCommunityTasks.mockResolvedValueOnce(taskPageFor([taskFor('task-2')]));
    await detail.loadTasks(row.groupId);

    expect(detail.tasksError.value).toBeNull();
    expect(detail.tasks.value[0]?.taskId).toBe('task-2');
  });
});
