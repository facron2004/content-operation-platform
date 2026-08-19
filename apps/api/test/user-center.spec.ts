import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { JeeSiteMemberClient } from '../src/user-center/jeesite-member.client';
import { UserCenterListQueryDto } from '../src/user-center/user-center.dto';
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

  it('accepts the real last page while keeping page size bounded', async () => {
    const validErrors = await validate(
      plainToInstance(UserCenterListQueryDto, { page: 8139, pageSize: 20 })
    );
    const oversizedErrors = await validate(
      plainToInstance(UserCenterListQueryDto, { page: 8139, pageSize: 101 })
    );

    expect(validErrors).toHaveLength(0);
    expect(oversizedErrors.some((error) => error.property === 'pageSize')).toBe(true);
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
        groupBy: vi.fn().mockResolvedValue([
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
        groupBy: vi.fn().mockResolvedValue([{ parentInviteCode: 'INV-001', _count: { _all: 3 } }])
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
              parentCode: 'INV-ROOT',
              createDate: '2026-08-14 10:06',
              updateDate: '2026-08-14 10:11',
              loginDate: '2026-08-14 10:11:15',
              point: '12.34',
              bonus: 765,
              status: '0',
              identity: 2
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
          findMany: vi
            .fn()
            .mockResolvedValue([
              { ...createMemberRow(), memberId: 'member-external-1', inviteCode: 'INV-EXT-001' }
            ]),
          groupBy: vi
            .fn()
            .mockResolvedValue([{ parentInviteCode: 'INV-EXT-001', _count: { _all: 4 } }])
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
        welfareBalanceFen: '1234',
        pointsBalance: 765,
        downlineCount: 4,
        sourceCreatedAt: '2026-08-14T02:06:00.000Z',
        sourceUpdatedAt: '2026-08-14T02:11:00.000Z',
        sourceLastLoginAt: '2026-08-14T02:11:15.000Z'
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

  it('fetches the requested external page even when a completed directory snapshot exists', async () => {
    const previousBaseUrl = process.env.EXTERNAL_API_BASE_URL;
    process.env.EXTERNAL_API_BASE_URL = 'https://members.example.test/a';
    try {
      const externalClient = {
        listMembers: vi.fn().mockResolvedValue({
          pageNo: 8139,
          pageSize: 20,
          count: 163833,
          list: [
            {
              id: 'member-page-8139',
              nickName: '指定页用户',
              code: 'INV-PAGE-8139',
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
              metaJson: JSON.stringify({ snapshotReady: true, generation: 'generation-page' })
            }
          ])
          .mockResolvedValue([]),
        member: { findMany: vi.fn().mockResolvedValue([]) },
        orderHeader: { groupBy: vi.fn().mockResolvedValue([]) },
        memberDirectoryEntry: {
          findMany: vi.fn().mockResolvedValue([]),
          groupBy: vi.fn().mockResolvedValue([])
        },
        userTagRelation: { findMany: vi.fn().mockResolvedValue([]) }
      } as unknown as PrismaService;

      const service = new UserCenterService(prisma, externalClient);
      const result = await service.listMembers({ page: 8139, pageSize: 20 });

      expect(externalClient.listMembers).toHaveBeenCalledTimes(1);
      expect(externalClient.listMembers).toHaveBeenCalledWith({
        page: 8139,
        pageSize: 20,
        search: undefined,
        level: undefined
      });
      expect(result.pagination).toMatchObject({ page: 8139, pageSize: 20, total: 163833 });
      expect(result.dataSources).toContain('MemberDirectoryEntry');
      expect(prisma.memberDirectoryEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { memberId: { in: ['member-page-8139'] }, lastSyncGeneration: 'generation-page' }
        })
      );
    } finally {
      if (previousBaseUrl === undefined) delete process.env.EXTERNAL_API_BASE_URL;
      else process.env.EXTERNAL_API_BASE_URL = previousBaseUrl;
    }
  });

  it('deduplicates concurrent requests for the same external page', async () => {
    const previousBaseUrl = process.env.EXTERNAL_API_BASE_URL;
    process.env.EXTERNAL_API_BASE_URL = 'https://members.example.test/a';
    try {
      let resolvePage: ((page: { pageNo: number; pageSize: number; count: number; list: [] }) => void) | undefined;
      const externalClient = {
        listMembers: vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              resolvePage = resolve;
            })
        )
      } as unknown as JeeSiteMemberClient;
      const prisma = {
        $queryRawUnsafe: vi.fn().mockResolvedValue([{ metaJson: null }])
      } as unknown as PrismaService;
      const service = new UserCenterService(prisma, externalClient);
      const query = { page: 2, pageSize: 20 };

      const first = service.listMembers(query);
      const second = service.listMembers(query);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(externalClient.listMembers).toHaveBeenCalledTimes(1);

      resolvePage?.({ pageNo: 2, pageSize: 20, count: 163833, list: [] });
      await Promise.all([first, second]);
      expect(externalClient.listMembers).toHaveBeenCalledTimes(1);
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

  it('writes point and bonus to separate directory balance columns', async () => {
    const $executeRawUnsafe = vi.fn().mockResolvedValue(1);
    const service = new UserCenterService({ $executeRawUnsafe } as never);

    await (
      service as unknown as {
        persistMemberDirectoryPage: (
          rows: Array<Record<string, unknown>>,
          generation: string
        ) => Promise<{ persisted: number; errors: number }>;
      }
    ).persistMemberDirectoryPage(
      [
        {
          id: 'member-rights-1',
          code: 'INV-RIGHTS-1',
          parentCode: 'INV-ROOT',
          point: '12.34',
          bonus: 765
        }
      ],
      'generation-rights'
    );

    expect($executeRawUnsafe).toHaveBeenCalledTimes(1);
    const [sql, ...params] = $executeRawUnsafe.mock.calls[0];
    expect(sql).toContain('"MemberDirectoryRefreshEntry"');
    expect(sql).not.toContain('INSERT INTO "MemberDirectoryEntry"');
    expect(sql).toContain('"welfareBalanceFen"');
    expect(sql).toContain('"pointsBalance"');
    expect(params).toContain(1234n);
    expect(params).toContain(765);
  });

  it('loads the newest existing directory member as the incremental boundary', async () => {
    const $queryRawUnsafe = vi.fn().mockResolvedValue([
      {
        memberId: 'old-latest',
        sourceCreatedAt: '2026-08-18 20:05:00'
      }
    ]);
    const service = new UserCenterService({ $queryRawUnsafe } as never);

    const boundary = await (
      service as unknown as {
        loadLatestExistingMemberDirectoryMember: (
          generation: string
        ) => Promise<{ memberId: string; sourceCreatedAt: Date } | null>;
      }
    ).loadLatestExistingMemberDirectoryMember('generation-active');

    expect(boundary).toEqual({
      memberId: 'old-latest',
      sourceCreatedAt: new Date('2026-08-18T20:05:00.000Z')
    });
    expect($queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY datetime('),
      'generation-active'
    );
  });

  it('publishes a staged generation with a short pointer transaction', async () => {
    const transactionStatements: string[] = [];
    const cleanupStatements: string[] = [];
    const transactionClient = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ count: 1 }]),
      $executeRawUnsafe: vi.fn(async (sql: unknown) => {
        transactionStatements.push(String(sql));
        return 1;
      })
    };
    const prisma = {
      $transaction: vi.fn(
        async (
          callback: (tx: typeof transactionClient) => Promise<void>,
          _options?: { timeout?: number; maxWait?: number }
        ) => callback(transactionClient)
      ),
      $executeRawUnsafe: vi.fn(async (sql: unknown) => {
        cleanupStatements.push(String(sql));
        return 1;
      })
    } as unknown as PrismaService;
    const service = new UserCenterService(prisma);

    await (
      service as unknown as {
        activateMemberDirectorySnapshot: (generation: string) => Promise<void>;
      }
    ).activateMemberDirectorySnapshot('generation-atomic');

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ timeout: 10_000, maxWait: 10_000 })
    );
    expect(transactionClient.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('FROM "MemberDirectoryRefreshEntry"'),
      'generation-atomic'
    );
    expect(transactionStatements).toHaveLength(1);
    expect(transactionStatements[0]).toContain('MemberDirectorySnapshotState');
    expect(transactionStatements[0]).not.toContain('MemberDirectoryEntry"');
    expect(cleanupStatements).toHaveLength(1);
    expect(cleanupStatements[0]).toContain('DELETE FROM "MemberDirectoryRefreshEntry"');
  });
});
