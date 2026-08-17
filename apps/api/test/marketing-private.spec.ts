import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { FinanceAssetService } from '../src/finance-center/finance-asset.service';
import { MarketingPrivateService } from '../src/marketing-private/marketing-private.service';

function tagRow() {
  return {
    tagId: 'tag-1',
    name: '高频用户',
    code: 'high_frequency',
    category: '运营',
    tagType: 'manual',
    description: null,
    status: 'active',
    memberCount: 0,
    createdAt: new Date('2026-08-11T00:00:00.000Z'),
    updatedAt: new Date('2026-08-11T00:00:00.000Z')
  };
}

describe('marketing and private domain center', () => {
  it('creates a tag and enforces a campaign transition matrix', async () => {
    const row = tagRow();
    const prisma = {
      userTag: { create: vi.fn().mockResolvedValue(row) },
      marketingCampaign: {
        findUnique: vi.fn().mockResolvedValue({ campaignId: 'campaign-1', status: 'draft' }),
        update: vi.fn().mockResolvedValue({
          campaignId: 'campaign-1',
          name: '拉新活动',
          description: null,
          campaignType: 'coupon',
          goalType: '拉新',
          audienceId: null,
          benefitsJson: null,
          targetMetricsJson: null,
          status: 'active',
          startDate: new Date('2026-08-11T00:00:00.000Z'),
          endDate: new Date('2026-08-18T00:00:00.000Z'),
          budgetFen: 0n,
          targetGmvFen: 0n,
          targetOrders: 0,
          ownerId: 'admin',
          createdAt: new Date('2026-08-11T00:00:00.000Z'),
          updatedAt: new Date('2026-08-11T00:00:00.000Z'),
          channels: []
        })
      }
    } as unknown as PrismaService;
    const service = new MarketingPrivateService(prisma, {} as FinanceAssetService);

    const created = await service.createTag({
      name: row.name,
      code: row.code,
      category: row.category,
      description: undefined
    });
    expect(created).toMatchObject({ tagId: 'tag-1', code: 'high_frequency' });

    const started = await service.transitionCampaign('campaign-1', 'start');
    expect(started.status).toBe('active');
    expect(prisma.marketingCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'active' } })
    );
  });

  it('evaluates a rule tag and writes matched member relations', async () => {
    const tag = {
      ...tagRow(),
      tagId: 'tag-rule-1',
      name: '已付费用户',
      code: 'paid_users',
      tagType: 'rule'
    };
    const updatedTag = { ...tag, memberCount: 1 };
    const tx = {
      userTagRelation: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn()
      },
      userTag: {
        update: vi.fn().mockResolvedValue(updatedTag)
      }
    };
    const prisma = {
      userTag: {
        create: vi.fn().mockResolvedValue(tag),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updatedTag)
      },
      ruleConfig: {
        create: vi.fn().mockResolvedValue({})
      },
      member: {
        findMany: vi.fn().mockResolvedValue([
          {
            memberId: 'member-1',
            nickname: '张三',
            phone: '13800000000',
            level: 'gold',
            pointsBalance: 100,
            totalOrders: 1,
            totalGmvFen: 1000n
          }
        ])
      },
      $queryRawUnsafe: vi.fn().mockResolvedValue([
        {
          memberId: 'member-1',
          totalOrders: 1,
          paidOrderCount: 1,
          paidGmvFen: 1000n,
          firstPaidAt: '2026-08-01 00:00:00',
          lastPaidAt: '2026-08-10 00:00:00'
        }
      ]),
      $transaction: vi.fn(async (callback: (db: unknown) => Promise<unknown>) => callback(tx))
    } as unknown as PrismaService;
    const service = new MarketingPrivateService(prisma, {} as FinanceAssetService);

    const result = await service.createTag({
      name: tag.name,
      code: tag.code,
      category: tag.category,
      tagType: 'rule',
      ruleJson: JSON.stringify({
        logic: 'and',
        conditions: [{ field: 'paidOrderCount', operator: 'gte', value: 1 }]
      })
    });

    expect(result).toMatchObject({ tagId: tag.tagId, tagType: 'rule', memberCount: 1 });
    expect(prisma.ruleConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'user-tag' }) })
    );
    expect(tx.userTagRelation.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ tagId: tag.tagId, memberId: 'member-1', source: 'rule' })]
    });
    expect(tx.userTag.update).toHaveBeenCalledWith({
      where: { tagId: tag.tagId },
      data: { memberCount: 1 }
    });
  });

  it('evaluates rules against the completed directory snapshot and tags external-only members', async () => {
    const tag = {
      ...tagRow(),
      tagId: 'tag-directory-1',
      name: '目录积分用户',
      code: 'directory_points',
      tagType: 'rule'
    };
    const updatedTag = { ...tag, memberCount: 1 };
    const tx = {
      userTagRelation: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn()
      },
      userTag: {
        update: vi.fn().mockResolvedValue(updatedTag)
      }
    };
    const prisma = {
      userTag: {
        create: vi.fn().mockResolvedValue(tag),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updatedTag)
      },
      ruleConfig: {
        create: vi.fn().mockResolvedValue({})
      },
      member: {
        findMany: vi.fn().mockResolvedValue([])
      },
      memberDirectoryEntry: {
        findMany: vi.fn().mockResolvedValue([
          {
            memberId: 'member-directory-1',
            nickname: '目录用户',
            phone: '13900000000',
            level: 'gold',
            pointsBalance: 321,
            sourceCreatedAt: null,
            sourceUpdatedAt: null,
            sourceLastLoginAt: null
          }
        ])
      },
      $queryRawUnsafe: vi
        .fn()
        .mockResolvedValueOnce([
          {
            metaJson: JSON.stringify({ snapshotReady: true, generation: 'generation-directory-1' })
          }
        ])
        .mockResolvedValueOnce([
          {
            memberId: 'member-directory-1',
            totalOrders: 0,
            paidOrderCount: 0,
            paidGmvFen: null,
            firstPaidAt: null,
            lastPaidAt: null
          }
        ]),
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
      $transaction: vi.fn(async (callback: (db: unknown) => Promise<unknown>) => callback(tx))
    } as unknown as PrismaService;
    const service = new MarketingPrivateService(prisma, {} as FinanceAssetService);

    const result = await service.createTag({
      name: tag.name,
      code: tag.code,
      category: tag.category,
      tagType: 'rule',
      ruleJson: JSON.stringify({
        logic: 'and',
        conditions: [{ field: 'pointsBalance', operator: 'gte', value: 300 }]
      })
    });

    expect(result).toMatchObject({ tagId: tag.tagId, memberCount: 1 });
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE INTO "Member"'),
      'generation-directory-1',
      'member-directory-1'
    );
    expect(tx.userTagRelation.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ memberId: 'member-directory-1', source: 'rule' })]
    });
  });

  it('recalculates a dynamic audience from tag relations and synchronizes memberships', async () => {
    const existing = {
      audienceId: 'audience-1',
      audienceNo: 'AUD-1',
      name: '沉睡会员',
      description: null,
      audienceType: 'DYNAMIC',
      ruleJson: JSON.stringify({ tags: ['sleep'], logic: 'and' }),
      estimatedCount: 99,
      snapshotCount: 0,
      status: 'disabled',
      createdBy: 'admin-1',
      createdAt: new Date('2026-08-11T00:00:00.000Z'),
      updatedAt: new Date('2026-08-11T00:00:00.000Z')
    };
    const updated = {
      ...existing,
      estimatedCount: 2,
      updatedAt: new Date('2026-08-12T00:00:00.000Z')
    };
    const tx = {
      audienceMember: {
        findMany: vi.fn().mockResolvedValue([
          { memberId: 'member-2', exitedAt: null },
          { memberId: 'member-3', exitedAt: null }
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      audience: { update: vi.fn().mockResolvedValue(updated) }
    };
    const prisma = {
      audience: { findUnique: vi.fn().mockResolvedValue(existing) },
      userTag: {
        findMany: vi.fn().mockResolvedValue([{ tagId: 'tag-sleep', code: 'sleep' }])
      },
      userTagRelation: {
        findMany: vi.fn().mockResolvedValue([
          { tagId: 'tag-sleep', memberId: 'member-1' },
          { tagId: 'tag-sleep', memberId: 'member-2' }
        ])
      },
      $transaction: vi.fn(async (callback: (db: unknown) => Promise<unknown>) => callback(tx))
    } as unknown as PrismaService;
    const service = new MarketingPrivateService(prisma, {} as FinanceAssetService);

    const result = await service.recalculateAudience('audience-1');

    expect(result).toMatchObject({ estimatedCount: 2, snapshotCount: 0, status: 'disabled' });
    expect(tx.audienceMember.updateMany).toHaveBeenCalledWith({
      where: { audienceId: 'audience-1', memberId: { in: ['member-3'] } },
      data: { exitedAt: expect.any(Date) }
    });
    expect(tx.audienceMember.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ memberId: 'member-1', source: 'dynamic' })]
    });
    expect(tx.audience.update).toHaveBeenCalledWith({
      where: { audienceId: 'audience-1' },
      data: { estimatedCount: 2, snapshotCount: 0 }
    });
  });

  it('creates a snapshot audience with rule-derived counts instead of a submitted estimate', async () => {
    const now = new Date('2026-08-12T00:00:00.000Z');
    const tx = {
      audience: {
        create: vi
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ ...data, status: 'active', createdAt: now, updatedAt: now })
          )
      },
      audienceMember: { createMany: vi.fn().mockResolvedValue({ count: 1 }) }
    };
    const prisma = {
      userTag: {
        findMany: vi.fn().mockResolvedValue([{ tagId: 'tag-vip', code: 'vip' }])
      },
      userTagRelation: {
        findMany: vi.fn().mockResolvedValue([{ tagId: 'tag-vip', memberId: 'member-1' }])
      },
      $transaction: vi.fn(async (callback: (db: unknown) => Promise<unknown>) => callback(tx))
    } as unknown as PrismaService;
    const service = new MarketingPrivateService(prisma, {} as FinanceAssetService);

    const result = await service.createAudience(
      {
        name: 'VIP 快照',
        audienceType: 'SNAPSHOT',
        ruleJson: JSON.stringify({ tags: ['vip'], logic: 'or' })
      },
      { userId: 'admin-1' }
    );

    expect(result).toMatchObject({ estimatedCount: 1, snapshotCount: 1, status: 'active' });
    expect(tx.audienceMember.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ memberId: 'member-1', source: 'snapshot' })]
    });
  });

  it('rejects unsupported audience rule fields instead of reporting a fake recalculation', async () => {
    const prisma = {
      audience: {
        findUnique: vi.fn().mockResolvedValue({
          audienceId: 'audience-1',
          ruleJson: JSON.stringify({ tags: [], age: 20 })
        })
      }
    } as unknown as PrismaService;
    const service = new MarketingPrivateService(prisma, {} as FinanceAssetService);

    await expect(service.recalculateAudience('audience-1')).rejects.toThrow(
      '人群规则暂不支持字段：age'
    );
  });

  it('writes benefit grants through the shared append-only asset ledger', async () => {
    const tx = {
      member: { findUnique: vi.fn().mockResolvedValue(null) },
      benefitAccount: { upsert: vi.fn() }
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (db: unknown) => Promise<unknown>) => callback(tx))
    } as unknown as PrismaService;
    const assets = {
      ensureAccount: vi.fn().mockResolvedValue({ id: 'benefit-account-1' }),
      applyChange: vi.fn().mockResolvedValue({
        ledgerNo: 'AL-1',
        changeAmount: '500',
        afterBalance: '500'
      })
    } as unknown as FinanceAssetService;
    const service = new MarketingPrivateService(prisma, assets);

    const result = await service.grantBenefit(
      { memberId: 'member-1', amountFen: '500', businessId: 'campaign-1', remark: '新客权益' },
      { userId: 'admin-1' },
      'benefit-request-1'
    );

    expect(result).toMatchObject({ success: true, capability: 'ready' });
    expect(assets.ensureAccount).toHaveBeenCalledWith(tx, {
      ownerType: 'USER',
      ownerId: 'member-1',
      assetType: 'BENEFIT'
    });
    expect(assets.applyChange).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        requestId: 'benefit-request-1',
        businessType: 'benefit_grant',
        changeAmount: 500n
      })
    );
  });

  it('marks SMS execution as manual-required when the provider is not connected', async () => {
    const row = {
      taskId: 'task-1',
      taskNo: 'SMST-1',
      name: '首单提醒',
      templateId: 'template-1',
      audienceId: 'audience-1',
      campaignId: null,
      scheduleAt: null,
      status: 'manual_required',
      totalCount: 10,
      successCount: 0,
      failCount: 0,
      createdBy: 'admin-1',
      createdAt: new Date('2026-08-11T00:00:00.000Z'),
      updatedAt: new Date('2026-08-11T00:00:00.000Z')
    };
    const prisma = {
      smsTask: {
        findUnique: vi.fn().mockResolvedValue({ ...row, status: 'scheduled' }),
        update: vi.fn().mockResolvedValue(row)
      }
    } as unknown as PrismaService;
    const service = new MarketingPrivateService(prisma, {} as FinanceAssetService);

    const result = await service.triggerSmsTask('task-1');
    expect(result).toMatchObject({ status: 'manual_required', capability: 'not_connected' });
    expect(prisma.smsTask.update).toHaveBeenCalledWith({
      where: { taskId: 'task-1' },
      data: { status: 'manual_required' }
    });
  });
});
