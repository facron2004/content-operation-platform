import { describe, expect, it } from 'vitest';
import type { MemberBehaviorFact } from '../src/common/member-behavior-facts';
import { matchesUserTagRule, parseUserTagRule } from '../src/marketing-private/user-tag-rules';

const fact: MemberBehaviorFact = {
  memberId: 'member-1',
  nickname: '高价值用户',
  phone: '13812345678',
  level: 'gold',
  pointsBalance: 120,
  totalOrders: 5,
  totalGmvFen: 88000n,
  paidOrderCount: 4,
  paidGmvFen: 88000n,
  firstPaidAt: new Date('2026-07-01T00:00:00.000Z'),
  lastPaidAt: new Date('2026-08-10T00:00:00.000Z'),
  daysSinceLastPaid: 2
};

describe('user tag rules', () => {
  it('matches multiple behavior conditions with AND/OR logic', () => {
    const andRule = parseUserTagRule(
      JSON.stringify({
        logic: 'and',
        conditions: [
          { field: 'level', operator: 'eq', value: 'gold' },
          { field: 'paidOrderCount', operator: 'gte', value: '3' },
          { field: 'paidGmvFen', operator: 'gte', value: '80000' }
        ]
      })
    );
    expect(matchesUserTagRule(fact, andRule)).toBe(true);

    const orRule = parseUserTagRule({
      logic: 'or',
      conditions: [{ field: 'daysSinceLastPaid', operator: 'gt', value: 30 }]
    });
    expect(matchesUserTagRule(fact, orRule)).toBe(false);
  });

  it('rejects unsupported and empty rules before they reach persistence', () => {
    expect(() => parseUserTagRule({ logic: 'and', conditions: [] })).toThrow('至少需要一个条件');
    expect(() =>
      parseUserTagRule({
        logic: 'and',
        conditions: [{ field: 'paidOrderCount', operator: 'gte', value: '-1' }]
      })
    ).toThrow('非负数字');
  });
});
