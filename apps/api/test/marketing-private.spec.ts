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
