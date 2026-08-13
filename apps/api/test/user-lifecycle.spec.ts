import { describe, expect, it } from 'vitest';
import type { MemberBehaviorFact } from '../src/common/member-behavior-facts';
import { classifyUserLifecycle } from '../src/user-center/user-lifecycle';

const now = new Date('2026-08-12T00:00:00.000Z');

function fact(overrides: Partial<MemberBehaviorFact>): MemberBehaviorFact {
  return {
    memberId: 'member-1',
    nickname: null,
    phone: null,
    level: 'normal',
    pointsBalance: 0,
    totalOrders: 0,
    totalGmvFen: null,
    paidOrderCount: 0,
    paidGmvFen: null,
    firstPaidAt: null,
    lastPaidAt: null,
    daysSinceLastPaid: null,
    ...overrides
  };
}

describe('user lifecycle classification', () => {
  it('uses paid behavior to classify all lifecycle stages', () => {
    expect(classifyUserLifecycle(fact({}), now)).toBe('prospect');
    expect(
      classifyUserLifecycle(
        fact({
          paidOrderCount: 1,
          firstPaidAt: new Date('2026-08-01T00:00:00.000Z'),
          lastPaidAt: new Date('2026-08-10T00:00:00.000Z')
        }),
        now
      )
    ).toBe('new');
    expect(
      classifyUserLifecycle(
        fact({
          paidOrderCount: 3,
          firstPaidAt: new Date('2026-06-01T00:00:00.000Z'),
          lastPaidAt: new Date('2026-08-01T00:00:00.000Z')
        }),
        now
      )
    ).toBe('active');
    expect(
      classifyUserLifecycle(
        fact({
          paidOrderCount: 2,
          firstPaidAt: new Date('2026-01-01T00:00:00.000Z'),
          lastPaidAt: new Date('2026-06-15T00:00:00.000Z')
        }),
        now
      )
    ).toBe('at_risk');
    expect(
      classifyUserLifecycle(
        fact({
          paidOrderCount: 2,
          firstPaidAt: new Date('2025-01-01T00:00:00.000Z'),
          lastPaidAt: new Date('2026-01-01T00:00:00.000Z')
        }),
        now
      )
    ).toBe('churned');
  });
});
