import type { Tx } from '../repositories/task.repository';
import { TASK_STATUS_MUTATE_COLUMNS, type TaskRow } from '../distribution-task-query';

/**
 * Allowed status transitions for DistributionTask.
 */
export const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['waiting_audit', 'scheduled', 'cancelled'],
  waiting_audit: ['scheduled', 'blocked', 'cancelled'],
  scheduled: ['published', 'overdue', 'failed', 'cancelled'],
  published: ['completed', 'cancelled'],
  completed: [],
  overdue: ['cancelled'],
  failed: [],
  cancelled: [],
  blocked: ['scheduled', 'cancelled']
};

export function canTransition(fromStatus: string, toStatus: string): boolean {
  const allowed = VALID_TRANSITIONS[fromStatus] ?? [];
  return allowed.includes(toStatus);
}

export function assertTransition(fromStatus: string, toStatus: string, label?: string): void {
  if (!canTransition(fromStatus, toStatus)) {
    const action = label ?? `transition ${fromStatus} → ${toStatus}`;
    throw new Error(
      `Cannot ${action}. Status '${fromStatus}' does not allow transition to '${toStatus}'.`
    );
  }
}

/** Statuses that are terminal (no further transitions allowed). */
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** Statuses for which delete is allowed. */
export const DELETABLE_STATUSES = new Set([
  'draft',
  'cancelled',
  'failed',
  'blocked',
  'waiting_audit'
]);

export function isDeletable(status: string): boolean {
  return DELETABLE_STATUSES.has(status);
}

/**
 * Execute a status transition with optimistic locking via status pin in WHERE.
 * Returns the updated row or null if the transition failed (concurrent change).
 */
export async function transitionPublished(
  tx: Tx,
  taskId: string,
  publishTitle: string | null,
  publishBody: string | null,
  publishCta: string | null
): Promise<TaskRow | null> {
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const returned = await tx.$queryRawUnsafe<TaskRow[]>(
    `UPDATE "DistributionTask"
     SET "status" = 'published',
         "publishedAt" = ?,
         "title" = ?,
         "body" = ?,
         "cta" = ?,
         "updatedAt" = ?
     WHERE "taskId" = ? AND "status" = 'scheduled'
     RETURNING ${TASK_STATUS_MUTATE_COLUMNS}`,
    now,
    publishTitle,
    publishBody,
    publishCta,
    now,
    taskId
  );
  return returned[0] ?? null;
}

export async function transitionFail(tx: Tx, taskId: string): Promise<TaskRow | null> {
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const returned = await tx.$queryRawUnsafe<TaskRow[]>(
    `UPDATE "DistributionTask" SET "status" = 'failed', "updatedAt" = ?
     WHERE "taskId" = ? AND "status" = 'scheduled'
     RETURNING ${TASK_STATUS_MUTATE_COLUMNS}`,
    now,
    taskId
  );
  return returned[0] ?? null;
}

export async function transitionCancel(
  tx: Tx,
  taskId: string,
  reason: string | null,
  currentStatus: string
): Promise<TaskRow | null> {
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const returned = await tx.$queryRawUnsafe<TaskRow[]>(
    `UPDATE "DistributionTask" SET "status" = 'cancelled', "cancelReason" = ?, "updatedAt" = ?
     WHERE "taskId" = ? AND "status" = ?
     RETURNING ${TASK_STATUS_MUTATE_COLUMNS}`,
    reason,
    now,
    taskId,
    currentStatus
  );
  return returned[0] ?? null;
}

export async function transitionSchedule(
  tx: Tx,
  taskId: string,
  plannedAt: string,
  currentStatus: string
): Promise<TaskRow | null> {
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const returned = await tx.$queryRawUnsafe<TaskRow[]>(
    `UPDATE "DistributionTask"
     SET "status" = 'scheduled', "plannedAt" = ?, "updatedAt" = ?
     WHERE "taskId" = ? AND "status" = ?
     RETURNING ${TASK_STATUS_MUTATE_COLUMNS}`,
    plannedAt,
    now,
    taskId,
    currentStatus
  );
  return returned[0] ?? null;
}

export async function transitionComplete(
  tx: Tx,
  taskId: string,
  _currentStatus: string
): Promise<TaskRow | null> {
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const returned = await tx.$queryRawUnsafe<TaskRow[]>(
    `UPDATE "DistributionTask"
     SET "status" = 'completed', "completedAt" = ?, "updatedAt" = ?
     WHERE "taskId" = ? AND "status" = 'published'
     RETURNING ${TASK_STATUS_MUTATE_COLUMNS}`,
    now,
    now,
    taskId
  );
  return returned[0] ?? null;
}

export async function transitionReassign(
  tx: Tx,
  taskId: string,
  assigneeId: string | null,
  assigneeName: string | null,
  currentStatus: string
): Promise<TaskRow | null> {
  const now = new Date().toISOString().replace('T', ' ').replace('Z', '');
  const returned = await tx.$queryRawUnsafe<TaskRow[]>(
    `UPDATE "DistributionTask"
     SET "assigneeId" = ?, "assigneeName" = ?, "updatedAt" = ?
     WHERE "taskId" = ? AND "status" = ?
     RETURNING ${TASK_STATUS_MUTATE_COLUMNS}`,
    assigneeId,
    assigneeName,
    now,
    taskId,
    currentStatus
  );
  return returned[0] ?? null;
}
