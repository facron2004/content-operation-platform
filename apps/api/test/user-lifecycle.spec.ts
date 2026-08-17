import { describe, expect, it, vi } from 'vitest';
import {
  loadMemberBehaviorFacts,
  type MemberBehaviorFact
} from '../src/common/member-behavior-facts';
import type { PrismaService } from '../src/prisma/prisma.service';
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

  it('uses the completed external directory snapshot for source activity timestamps', async () => {
    const now = new Date('2026-08-14T03:00:00.000Z');
    const prisma = {
      member: {
        findMany: vi.fn().mockResolvedValue([
          {
            memberId: 'member-1',
            nickname: '本地名称',
            phone: '13812345678',
            level: 'gold',
            pointsBalance: 10,
            totalOrders: 0,
            totalGmvFen: null
          }
        ])
      },
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      memberDirectoryEntry: {
        findMany: vi.fn().mockResolvedValue([
          {
            memberId: 'member-1',
            nickname: '源站名称',
            phone: '13912345678',
            level: 'silver',
            pointsBalance: 321,
            sourceCreatedAt: new Date('2026-08-01T02:06:00.000Z'),
            sourceUpdatedAt: new Date('2026-08-14T02:11:00.000Z'),
            sourceLastLoginAt: new Date('2026-08-14T02:11:15.000Z')
          }
        ])
      }
    } as unknown as PrismaService;

    const [result] = await loadMemberBehaviorFacts(prisma, now, {
      directoryGeneration: 'generation-1'
    });

    expect(result).toMatchObject({
      nickname: '源站名称',
      phone: '13912345678',
      sourceCreatedAt: new Date('2026-08-01T02:06:00.000Z'),
      sourceUpdatedAt: new Date('2026-08-14T02:11:00.000Z'),
      sourceLastLoginAt: new Date('2026-08-14T02:11:15.000Z'),
      pointsBalance: 321,
      lastActivityAt: new Date('2026-08-14T02:11:15.000Z'),
      daysSinceLastActivity: 0
    });
  });
});
