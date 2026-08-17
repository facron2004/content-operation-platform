import { describe, expect, it, vi } from 'vitest';
import { normalizeMemberIntegralRecord } from '../src/member-integral/member-integral.adapter';
import { MemberIntegralService } from '../src/member-integral/member-integral.service';

describe('member integral records', () => {
  it('keeps parentCode as parentInviteCode when the integral row has no invite code', () => {
    const row = normalizeMemberIntegralRecord({
      id: 'integral-1',
      centerMemberId: 'member-1',
      parentCode: '74253861',
      consumptionIntegral: '76.74',
      integralType: 3,
      state: 1,
      createDate: '2026-08-14 10:11:15',
      centerMember: {
        id: 'member-1',
        nickName: '137****8362',
        phone: '137****8362'
      }
    });

    expect(row).toMatchObject({
      id: 'integral-1',
      centerMemberId: 'member-1',
      memberName: '137****8362',
      memberPhone: '137****8362',
      inviteCode: null,
      parentInviteCode: '74253861',
      consumptionIntegral: 76.74,
      integralType: 3,
      state: 1
    });
  });

  it('fetches only the requested page and deduplicates same-page callers', async () => {
    const listIntegralRecords = vi.fn(
      async ({ page, pageSize }: { page: number; pageSize: number }) => {
        await Promise.resolve();
        return {
          pageNo: page,
          pageSize,
          count: 444_567,
          list: [
            {
              id: 'integral-8139',
              centerMemberId: 'member-1',
              consumptionIntegral: 10,
              integralType: 1,
              state: 1,
              createDate: '2026-08-14 10:11:15',
              centerMember: { id: 'member-1', nickName: '会员一', phone: '137****8362' }
            }
          ]
        };
      }
    );
    const prisma = {
      memberDirectoryEntry: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { memberId: 'member-1', inviteCode: '87904261', parentInviteCode: '74253861' }
          ])
      },
      memberIntegralRecord: {
        count: vi.fn(),
        findMany: vi.fn()
      },
      $executeRawUnsafe: vi.fn().mockResolvedValue(1)
    };
    const service = new MemberIntegralService({ listIntegralRecords } as never, prisma as never);

    const [first, second] = await Promise.all([
      service.query({ page: 8139, pageSize: 20 }),
      service.query({ page: 8139, pageSize: 20 })
    ]);

    expect(listIntegralRecords).toHaveBeenCalledTimes(1);
    expect(listIntegralRecords).toHaveBeenCalledWith({ page: 8139, pageSize: 20 });
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      total: 444_567,
      page: 8139,
      pageSize: 20,
      dataSource: 'JeeSite',
      list: [
        expect.objectContaining({
          memberCode: '87904261',
          inviteCode: '87904261',
          parentInviteCode: '74253861'
        })
      ]
    });
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
