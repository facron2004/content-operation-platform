import type { MemberBehaviorFact } from '../common/member-behavior-facts';

export const USER_LIFECYCLE_STAGES = [
  'prospect',
  'new',
  'active',
  'at_risk',
  'churned'
] as const;

export type UserLifecycleStageKey = (typeof USER_LIFECYCLE_STAGES)[number];

export const USER_LIFECYCLE_STAGE_META: Record<
  UserLifecycleStageKey,
  { label: string; description: string }
> = {
  prospect: { label: '待转化', description: '尚未完成支付的用户' },
  new: { label: '新客', description: '首次支付在近 30 天内的用户' },
  active: { label: '活跃', description: '近 30 天内有支付且不是新客' },
  at_risk: { label: '沉睡预警', description: '最近一次支付距今 31–90 天' },
  churned: { label: '流失', description: '最近一次支付距今超过 90 天' }
};

export function classifyUserLifecycle(
  fact: MemberBehaviorFact,
  now = new Date()
): UserLifecycleStageKey {
  if (fact.paidOrderCount === 0 || !fact.lastPaidAt) return 'prospect';
  const lastPaidDays = Math.max(
    0,
    Math.floor((now.getTime() - fact.lastPaidAt.getTime()) / 86400000)
  );
  const firstPaidDays = fact.firstPaidAt
    ? Math.max(0, Math.floor((now.getTime() - fact.firstPaidAt.getTime()) / 86400000))
    : Number.POSITIVE_INFINITY;
  if (lastPaidDays <= 30 && firstPaidDays <= 30) return 'new';
  if (lastPaidDays <= 30) return 'active';
  if (lastPaidDays <= 90) return 'at_risk';
  return 'churned';
}
