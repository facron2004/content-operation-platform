import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { assertTaskUpdateMutable } from '../src/distribution-task/domain/task-update-policy';

describe('task update policy', () => {
  it('allows ordinary draft edits', () => {
    expect(() =>
      assertTaskUpdateMutable(
        { status: 'draft', publishedAt: null },
        {
          packageId: 'pkg-next',
          assigneeId: 'user-next'
        }
      )
    ).not.toThrow();
  });

  it('allows only rescheduling fields on a scheduled task', () => {
    expect(() =>
      assertTaskUpdateMutable(
        { status: 'scheduled', publishedAt: null },
        {
          plannedAt: '2026-08-04T12:00:00.000Z',
          priority: 'urgent'
        }
      )
    ).not.toThrow();

    expect(() =>
      assertTaskUpdateMutable(
        { status: 'scheduled', publishedAt: null },
        {
          packageId: 'pkg-next'
        }
      )
    ).toThrowError(new BadRequestException("任务状态为 'scheduled'，不可修改: packageId"));
  });

  it('freezes attribution fields when publish history exists', () => {
    expect(() =>
      assertTaskUpdateMutable(
        { status: 'cancelled', publishedAt: '2026-08-04 12:00:00' },
        {
          plannedAt: '2026-08-05T12:00:00.000Z'
        }
      )
    ).toThrowError(new BadRequestException("任务状态为 'cancelled'，不可修改: plannedAt"));

    expect(() =>
      assertTaskUpdateMutable(
        { status: 'cancelled', publishedAt: '2026-08-04 12:00:00' },
        {
          assigneeId: 'user-next',
          priority: 'low'
        }
      )
    ).not.toThrow();
  });

  it('freezes overdue and failed tasks even without publishedAt', () => {
    for (const status of ['overdue', 'failed']) {
      expect(() =>
        assertTaskUpdateMutable({ status, publishedAt: null }, { groupId: 'group-next' })
      ).toThrowError(new BadRequestException(`任务状态为 '${status}'，不可修改: groupId`));
    }
  });
});
