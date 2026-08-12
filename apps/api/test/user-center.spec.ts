import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { maskMemberPhone, UserCenterService } from '../src/user-center/user-center.service';

function createMemberRow() {
  return {
    memberId: 'member-1',
    nickname: '小惠',
    phone: '13812345678',
    level: 'gold',
    pointsBalance: 88,
    walletBalanceFen: 1250n,
    totalGmvFen: 45600n,
    firstOrderAt: new Date('2026-01-01T00:00:00.000Z'),
    lastOrderAt: new Date('2026-08-11T00:00:00.000Z'),
    totalOrders: 3,
    tags: '高频,本地'
  };
}

describe('user center', () => {
  it('masks member phone numbers without exposing the raw value', () => {
    expect(maskMemberPhone('13812345678')).toBe('138****5678');
    expect(maskMemberPhone('')).toBeNull();
  });

  it('composes paginated members from order facts instead of stale member aggregates', async () => {
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([
        {
          memberId: 'member-1',
          totalOrders: 5,
          totalGmvFen: 30000n,
          firstOrderAt: '2026-01-02 00:00:00',
          lastOrderAt: '2026-08-10 00:00:00'
        }
      ]),
      member: {
        count: vi.fn().mockResolvedValue(2),
        findMany: vi.fn().mockResolvedValue([createMemberRow()])
      },
      orderHeader: {
        groupBy: vi
          .fn()
          .mockResolvedValue([
            {
              memberId: 'member-1',
              _count: { _all: 2 },
              _sum: { paidAmountFen: 30000n },
              _max: { paidTime: new Date('2026-08-11T00:00:00.000Z') }
            }
          ])
      }
    } as unknown as PrismaService;
    const service = new UserCenterService(prisma);

    const result = await service.listMembers({ page: 1, pageSize: 20 });

    expect(result.items[0]).toMatchObject({
      memberId: 'member-1',
      phone: '138****5678',
      totalOrders: 5,
      totalGmvFen: '30000',
      paidOrderCount: 2,
      paidGmvFen: '30000',
      firstOrderAt: '2026-01-02T00:00:00.000Z',
      lastOrderAt: '2026-08-10T00:00:00.000Z'
    });
    expect(result.pagination).toMatchObject({ page: 1, pageSize: 20, total: 2, hasMore: true });
    expect(result.summary).toMatchObject({
      totalMembers: 2,
      paidMembers: 1,
      activeMembers30d: 1,
      totalOrders: 5,
      totalGmvFen: '30000'
    });
  });

  it('sorts pages by normalized order time instead of stale member timestamps', async () => {
    const staleMember = { ...createMemberRow(), memberId: 'stale-member', nickname: '旧用户' };
    const recentMember = { ...createMemberRow(), memberId: 'recent-member', nickname: '新用户' };
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([
        {
          memberId: 'stale-member',
          totalOrders: 1,
          totalGmvFen: 1000n,
          firstOrderAt: '2026-01-01 00:00:00',
          lastOrderAt: '2026-01-02 00:00:00'
        },
        {
          memberId: 'recent-member',
          totalOrders: 1,
          totalGmvFen: 2000n,
          firstOrderAt: '2026-08-01 00:00:00',
          lastOrderAt: '2026-08-10 00:00:00'
        }
      ]),
      member: {
        count: vi.fn().mockResolvedValue(2),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ memberId: 'stale-member' }, { memberId: 'recent-member' }])
          .mockResolvedValueOnce([staleMember, recentMember])
      },
      orderHeader: {
        groupBy: vi.fn().mockResolvedValue([])
      }
    } as unknown as PrismaService;
    const service = new UserCenterService(prisma);

    const result = await service.listMembers({ page: 1, pageSize: 20 });

    expect(result.items.map((item) => item.memberId)).toEqual(['recent-member', 'stale-member']);
  });
});
