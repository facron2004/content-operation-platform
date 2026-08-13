import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { JeeSiteMemberClient } from '../src/user-center/jeesite-member.client';
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

  it('returns invitation hierarchy fields and counts direct downline users', async () => {
    const member = {
      ...createMemberRow(),
      inviteCode: 'INV-001',
      parentInviteCode: 'INV-ROOT'
    };
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([
        {
          memberId: 'member-1',
          totalOrders: 1,
          totalGmvFen: 1200n,
          firstOrderAt: '2026-08-01 00:00:00',
          lastOrderAt: '2026-08-10 00:00:00'
        }
      ]),
      member: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ memberId: 'member-1' }])
          .mockResolvedValueOnce([member]),
        groupBy: vi.fn().mockResolvedValue([
          { parentInviteCode: 'INV-001', _count: { _all: 3 } }
        ])
      },
      orderHeader: {
        groupBy: vi.fn().mockResolvedValue([])
      }
    } as unknown as PrismaService;
    const service = new UserCenterService(prisma);

    const result = await service.listMembers({ page: 1, pageSize: 20, search: 'INV-001' });

    expect(result.items[0]).toMatchObject({
      inviteCode: 'INV-001',
      parentInviteCode: 'INV-ROOT',
      downlineCount: 3
    });
    expect(prisma.member.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ inviteCode: { contains: 'INV-001' } }])
        })
      })
    );
  });

  it('falls back to the legacy member projection when the invitation migration is not applied', async () => {
    const legacyMember = { ...createMemberRow(), memberId: 'legacy-member' };
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([
        {
          memberId: 'legacy-member',
          totalOrders: 1,
          totalGmvFen: 1200n,
          firstOrderAt: '2026-08-01 00:00:00',
          lastOrderAt: '2026-08-10 00:00:00'
        }
      ]),
      member: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ memberId: 'legacy-member' }])
          .mockRejectedValueOnce(new Error('SQLITE_ERROR: no such column: main.Member.inviteCode'))
          .mockResolvedValueOnce([{ memberId: 'legacy-member' }])
          .mockResolvedValueOnce([legacyMember])
      },
      orderHeader: {
        groupBy: vi.fn().mockResolvedValue([])
      }
    } as unknown as PrismaService;
    const service = new UserCenterService(prisma);

    const result = await service.listMembers({ page: 1, pageSize: 20 });

    expect(result.items[0]).toMatchObject({
      memberId: 'legacy-member',
      inviteCode: null,
      parentInviteCode: null,
      downlineCount: 0
    });
    expect(prisma.member.findMany).toHaveBeenCalledTimes(4);
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

  it('uses the external member directory count while joining local order facts for the page', async () => {
    const previousBaseUrl = process.env.EXTERNAL_API_BASE_URL;
    process.env.EXTERNAL_API_BASE_URL = 'https://members.example.test/a';
    try {
      const externalClient = {
        listMembers: vi.fn().mockResolvedValue({
          pageNo: 1,
          pageSize: 20,
          count: 163041,
          list: [
            {
              id: 'member-external-1',
              nickName: '外部用户',
              phone: '13912345678',
              code: 'INV-EXT-001',
              parentCode: 'INV-ROOT'
            }
          ]
        })
      } as unknown as JeeSiteMemberClient;
      const prisma = {
        $queryRawUnsafe: vi
          .fn()
          .mockResolvedValueOnce([
            {
              memberId: 'member-external-1',
              totalOrders: 2,
              totalGmvFen: 9000n,
              firstOrderAt: '2026-08-01 00:00:00',
              lastOrderAt: '2026-08-10 00:00:00'
            }
          ])
          .mockResolvedValueOnce([{ totalOrders: 99, totalGmvFen: 880000n }])
          .mockResolvedValueOnce([{ paidMembers: 12000, activeMembers30d: 2400 }]),
        member: {
          findMany: vi.fn().mockResolvedValue([
            { ...createMemberRow(), memberId: 'member-external-1', inviteCode: 'INV-EXT-001' }
          ]),
          groupBy: vi.fn().mockResolvedValue([
            { parentInviteCode: 'INV-EXT-001', _count: { _all: 4 } }
          ])
        },
        orderHeader: {
          groupBy: vi.fn().mockResolvedValue([
            {
              memberId: 'member-external-1',
              _count: { _all: 1 },
              _sum: { paidAmountFen: 9000n }
            }
          ])
        },
        userTagRelation: {
          findMany: vi.fn().mockResolvedValue([])
        }
      } as unknown as PrismaService;

      const service = new UserCenterService(prisma, externalClient);
      const result = await service.listMembers({ page: 1, pageSize: 20 });

      expect(result.pagination).toMatchObject({ total: 163041, hasMore: true });
      expect(result.summary).toMatchObject({
        totalMembers: 163041,
        paidMembers: 12000,
        activeMembers30d: 2400,
        totalOrders: 99,
        totalGmvFen: '880000'
      });
      expect(result.items[0]).toMatchObject({
        memberId: 'member-external-1',
        nickname: '外部用户',
        phone: '139****5678',
        inviteCode: 'INV-EXT-001',
        downlineCount: 4
      });
      expect(externalClient.listMembers).toHaveBeenCalledWith({
        page: 1,
        pageSize: 20,
        search: undefined,
        level: undefined
      });
    } finally {
      if (previousBaseUrl === undefined) delete process.env.EXTERNAL_API_BASE_URL;
      else process.env.EXTERNAL_API_BASE_URL = previousBaseUrl;
    }
  });

  it('opens an external-only member detail without requiring a local Member row', async () => {
    const previousBaseUrl = process.env.EXTERNAL_API_BASE_URL;
    process.env.EXTERNAL_API_BASE_URL = 'https://members.example.test/a';
    try {
      const externalClient = {
        listMembers: vi.fn().mockResolvedValue({
          pageNo: 1,
          pageSize: 1,
          count: 1,
          list: [
            {
              id: 'member-external-2',
              nickName: '仅外部档案',
              phone: '13812345678',
              code: 'INV-EXT-002'
            }
          ]
        })
      } as unknown as JeeSiteMemberClient;
      const prisma = {
        member: {
          findUnique: vi.fn().mockResolvedValue(null),
          count: vi.fn()
        },
        orderHeader: { findMany: vi.fn().mockResolvedValue([]) },
        memberPointLedger: { findMany: vi.fn().mockResolvedValue([]) },
        $queryRawUnsafe: vi
          .fn()
          .mockResolvedValueOnce([
            { totalOrders: 0, totalGmvFen: null, firstOrderAt: null, lastOrderAt: null }
          ])
          .mockResolvedValueOnce([{ paidOrderCount: 0, paidGmvFen: null }])
      } as unknown as PrismaService;

      const service = new UserCenterService(prisma, externalClient);
      const result = await service.getMember('member-external-2', 'INV-EXT-002');

      expect(result.member).toMatchObject({
        memberId: 'member-external-2',
        nickname: '仅外部档案',
        phone: '138****5678'
      });
      expect(externalClient.listMembers).toHaveBeenCalledWith({
        page: 1,
        pageSize: 1,
        inviteCode: 'INV-EXT-002'
      });
      expect(result.dataSources).toEqual(['JeeSite Member', 'OrderHeader', 'MemberPointLedger']);
    } finally {
      if (previousBaseUrl === undefined) delete process.env.EXTERNAL_API_BASE_URL;
      else process.env.EXTERNAL_API_BASE_URL = previousBaseUrl;
    }
  });
});
