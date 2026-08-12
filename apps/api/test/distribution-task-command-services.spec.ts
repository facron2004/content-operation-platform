import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  canTransition: vi.fn(),
  transitionPublished: vi.fn(),
  transitionFail: vi.fn(),
  transitionCancel: vi.fn(),
  transitionSchedule: vi.fn(),
  transitionComplete: vi.fn(),
  transitionReassign: vi.fn(),
  assertOptionalTaskFks: vi.fn(),
  findTaskRow: vi.fn(),
  parseTask: vi.fn((row: unknown) => row)
}));

vi.mock('../src/distribution-task/repositories/task.repository', () => ({
  getStatus: mocks.getStatus
}));

vi.mock('../src/distribution-task/domain/task-status-machine', () => ({
  canTransition: mocks.canTransition,
  transitionPublished: mocks.transitionPublished,
  transitionFail: mocks.transitionFail,
  transitionCancel: mocks.transitionCancel,
  transitionSchedule: mocks.transitionSchedule,
  transitionComplete: mocks.transitionComplete,
  transitionReassign: mocks.transitionReassign
}));

vi.mock('../src/distribution-task/distribution-task-query', () => ({
  findTaskRow: mocks.findTaskRow,
  parseTask: mocks.parseTask
}));

vi.mock('../src/distribution-task/distribution-task-fk', () => ({
  assertOptionalTaskFks: mocks.assertOptionalTaskFks
}));

import { CancelTaskService } from '../src/distribution-task/application/cancel-task.service';
import { PublishTaskService } from '../src/distribution-task/application/publish-task.service';

function makePrisma() {
  return {
    $queryRawUnsafe: vi.fn(),
    $executeRawUnsafe: vi.fn()
  };
}

function makeExecutionService() {
  return { create: vi.fn() };
}

describe('canonical distribution-task command services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parseTask.mockImplementation((row: unknown) => row);
    mocks.assertOptionalTaskFks.mockResolvedValue(undefined);
    mocks.canTransition.mockReturnValue(true);
  });

  it('publishes approved copy and records the publish execution', async () => {
    const prisma = makePrisma();
    const execution = makeExecutionService();
    const returned = { taskId: 'task-1', status: 'published' };
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        contentId: 'copy-1',
        packageId: 'pkg-1',
        auditStatus: 'approved',
        title: '已通过标题',
        body: '已通过正文',
        cta: '查看'
      }
    ]);
    mocks.transitionPublished.mockResolvedValue(returned);

    const service = new PublishTaskService(prisma as never, execution as never);
    const result = await service.publish(
      'task-1',
      {
        operatorId: 'user-1',
        operatorName: 'Alice',
        evidenceUrl: 'https://example.com/evidence',
        note: '已复核'
      },
      {
        status: 'scheduled',
        packageId: 'pkg-1',
        contentId: 'copy-1'
      }
    );

    expect(mocks.transitionPublished).toHaveBeenCalledWith(
      prisma,
      'task-1',
      '已通过标题',
      '已通过正文',
      '查看'
    );
    expect(execution.create).toHaveBeenCalledWith({
      taskId: 'task-1',
      action: 'publish',
      operatorId: 'user-1',
      operatorName: 'Alice',
      evidenceUrl: 'https://example.com/evidence',
      note: '已复核'
    });
    expect(result).toBe(returned);
  });

  it('writes the task transition, execution, and outbox event in one transaction', async () => {
    const tx = {
      $queryRawUnsafe: vi.fn(),
      $executeRawUnsafe: vi.fn()
    };
    const transaction = vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx)
    );
    const prisma = { ...makePrisma(), $transaction: transaction };
    const execution = makeExecutionService();
    const outbox = { publishEvent: vi.fn().mockResolvedValue('evt-publish') };
    const returned = { taskId: 'task-atomic', status: 'published' };
    prisma.$queryRawUnsafe.mockResolvedValue([
      {
        contentId: 'copy-atomic',
        packageId: 'pkg-1',
        auditStatus: 'approved',
        title: '原子标题',
        body: '原子正文',
        cta: '查看'
      }
    ]);
    mocks.transitionPublished.mockResolvedValue(returned);

    const service = new PublishTaskService(prisma as never, execution as never, outbox as never);
    const result = await service.publish(
      'task-atomic',
      { operatorId: 'user-1', operatorName: 'Alice', note: '已复核' },
      { status: 'scheduled', packageId: 'pkg-1', contentId: 'copy-atomic' }
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(mocks.transitionPublished).toHaveBeenCalledWith(
      tx,
      'task-atomic',
      '原子标题',
      '原子正文',
      '查看'
    );
    expect(execution.create).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-atomic', action: 'publish' }),
      tx
    );
    expect(outbox.publishEvent).toHaveBeenCalledWith(
      tx,
      'DistributionTask',
      'task-atomic',
      'task.published',
      { taskId: 'task-atomic', operatorId: 'user-1', operatorName: 'Alice' }
    );
    expect(result).toBe(returned);
  });

  it('fails a scheduled task and records the confirmation details', async () => {
    const prisma = makePrisma();
    const execution = makeExecutionService();
    const returned = { taskId: 'task-2', status: 'failed' };
    mocks.transitionFail.mockResolvedValue(returned);

    const service = new PublishTaskService(prisma as never, execution as never);
    const result = await service.fail(
      'task-2',
      {
        failReason: '外部平台失败',
        failCategory: 'platform',
        evidenceUrl: 'https://example.com/failure',
        note: '已确认'
      },
      'scheduled'
    );

    expect(mocks.transitionFail).toHaveBeenCalledWith(prisma, 'task-2');
    expect(execution.create).toHaveBeenCalledWith({
      taskId: 'task-2',
      action: 'confirm_fail',
      operatorId: undefined,
      operatorName: undefined,
      evidenceUrl: 'https://example.com/failure',
      failReason: '外部平台失败',
      failCategory: 'platform',
      note: '已确认'
    });
    expect(result).toBe(returned);
  });

  it('schedules a task with normalized time and records the plan', async () => {
    const prisma = makePrisma();
    const execution = makeExecutionService();
    const returned = { taskId: 'task-3', status: 'scheduled' };
    mocks.transitionSchedule.mockResolvedValue(returned);

    const service = new CancelTaskService(prisma as never, execution as never);
    const result = await service.schedule('task-3', '2026-08-04T12:30:00.000Z', {
      status: 'draft',
      packageId: 'pkg-1',
      body: '待发布正文'
    });

    expect(mocks.assertOptionalTaskFks).toHaveBeenCalledWith(prisma, {
      packageId: 'pkg-1',
      groupId: undefined,
      campaignId: undefined,
      fallbackPackageId: undefined,
      status: 'scheduled',
      excludeTaskId: 'task-3'
    });
    expect(mocks.transitionSchedule).toHaveBeenCalledWith(
      prisma,
      'task-3',
      '2026-08-04 12:30:00',
      'draft'
    );
    expect(execution.create).toHaveBeenCalledWith({
      taskId: 'task-3',
      action: 'schedule',
      note: 'plannedAt=2026-08-04 12:30:00'
    });
    expect(result).toBe(returned);
  });

  it('cancels and completes through the canonical transition functions', async () => {
    const prisma = makePrisma();
    const execution = makeExecutionService();
    const cancelled = { taskId: 'task-4', status: 'cancelled' };
    const completed = { taskId: 'task-5', status: 'completed' };
    mocks.transitionCancel.mockResolvedValue(cancelled);
    mocks.transitionComplete.mockResolvedValue(completed);

    const service = new CancelTaskService(prisma as never, execution as never);
    await expect(service.cancel('task-4', '运营取消', 'draft')).resolves.toBe(cancelled);
    await expect(service.complete('task-5', 'published')).resolves.toBe(completed);

    expect(mocks.transitionCancel).toHaveBeenCalledWith(prisma, 'task-4', '运营取消', 'draft');
    expect(mocks.transitionComplete).toHaveBeenCalledWith(prisma, 'task-5', 'published');
    expect(execution.create).toHaveBeenNthCalledWith(1, {
      taskId: 'task-4',
      action: 'cancel',
      note: '运营取消'
    });
    expect(execution.create).toHaveBeenNthCalledWith(2, {
      taskId: 'task-5',
      action: 'complete'
    });
  });
});
