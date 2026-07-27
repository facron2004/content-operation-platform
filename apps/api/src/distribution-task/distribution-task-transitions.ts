/**
 * Allowed status transitions for DistributionTask.
 * draft -> waiting_audit (when bound to unapproved copy)
 * draft -> scheduled (when bound to approved copy with plannedAt)
 * waiting_audit -> scheduled (when copy approved)
 * waiting_audit -> blocked (when copy risk/rejected)
 * scheduled -> published (confirm publish)
 * scheduled -> overdue (>30min past plannedAt, manual mark)
 * scheduled -> failed (report failure)
 * published -> completed (attribution window ended, manual mark)
 * Any -> cancelled (with reason)
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

// Residual #111: removed dead assertCanTransition — callers use canTransition
// and throw richer BadRequestException messages themselves.
