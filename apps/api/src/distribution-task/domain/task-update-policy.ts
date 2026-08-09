import { BadRequestException } from '@nestjs/common';
import type { UpdateTaskDto } from '../dto/update-task.dto';

type TaskUpdateFreezeMeta = {
  status: string;
  publishedAt: string | null;
};

const ATTRIBUTION_FROZEN_STATUSES = new Set([
  'published',
  'completed',
  'overdue',
  'cancelled',
  'failed'
]);

const PUBLISHED_FIELDS = [
  'packageId',
  'channel',
  'contentId',
  'body',
  'title',
  'cta',
  'campaignId',
  'groupId',
  'fallbackPackageId',
  'plannedAt'
] as const satisfies ReadonlyArray<keyof UpdateTaskDto>;

const SCHEDULED_FIELDS = [
  'packageId',
  'channel',
  'fallbackPackageId',
  'contentId',
  'body',
  'title',
  'cta',
  'campaignId',
  'groupId'
] as const satisfies ReadonlyArray<keyof UpdateTaskDto>;

/**
 * Keep attribution-sensitive task fields immutable after publish history exists.
 * Scheduled tasks may only move their plannedAt; assignment and operational fields
 * remain editable until a terminal/published state freezes the task.
 */
export function assertTaskUpdateMutable(meta: TaskUpdateFreezeMeta, dto: UpdateTaskDto): void {
  const frozen = Boolean(meta.publishedAt) || ATTRIBUTION_FROZEN_STATUSES.has(meta.status);
  const scheduledFreeze = meta.status === 'scheduled' && !frozen;
  if (!frozen && !scheduledFreeze) return;

  const fields = frozen ? PUBLISHED_FIELDS : SCHEDULED_FIELDS;
  const attempted = fields.filter((field) => dto[field] !== undefined);
  if (attempted.length > 0) {
    throw new BadRequestException(`任务状态为 '${meta.status}'，不可修改: ${attempted.join(', ')}`);
  }
}
