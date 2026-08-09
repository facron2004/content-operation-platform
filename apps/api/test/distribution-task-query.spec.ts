import { describe, expect, it } from 'vitest';
import {
  parseTask,
  TASK_STATUS_MUTATE_COLUMNS
} from '../src/distribution-task/distribution-task-query';

describe('distribution-task read projections', () => {
  it('redacts idempotency keys and tracking codes from default task reads', () => {
    const row = {
      taskId: 'task-1',
      campaignId: null,
      contentId: null,
      groupId: null,
      packageId: 'pkg-1',
      channel: 'wechat_group',
      title: '标题',
      body: '正文',
      cta: '购买',
      trackingCode: 'SECRET',
      idempotencyKey: 'WRITE_ONLY',
      status: 'draft',
      priority: 'normal',
      plannedAt: null,
      publishedAt: null,
      completedAt: null,
      cancelReason: null,
      assigneeId: null,
      assigneeName: null,
      riskLevel: null,
      fallbackPackageId: null,
      createdAt: '2026-08-03 10:00:00',
      updatedAt: '2026-08-03 10:00:00'
    } as never;

    const result = parseTask(row);
    expect(result).toMatchObject({ taskId: 'task-1', body: '正文' });
    expect(result.trackingCode).toBeUndefined();
    expect('idempotencyKey' in result).toBe(false);
    expect(TASK_STATUS_MUTATE_COLUMNS).not.toContain('idempotencyKey');
  });
});
