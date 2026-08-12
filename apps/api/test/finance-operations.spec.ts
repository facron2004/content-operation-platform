import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { FinanceAssetService } from '../src/finance-center/finance-asset.service';
import { FinanceOperationsService } from '../src/finance-center/finance-operations.service';

describe('finance operations', () => {
  it('writes an append-only asset ledger and replays the same request', async () => {
    const account = {
      id: 'account-1',
      ownerType: 'MERCHANT',
      ownerId: 'merchant-1',
      assetType: 'SETTLEMENT',
      balance: 1000n,
      frozenBalance: 200n,
      status: 'active',
      updatedAt: new Date('2026-08-11T00:00:00.000Z')
    };
    let createdLedger: Record<string, unknown> | null = null;
    const tx = {
      account: {
        findUnique: vi.fn().mockResolvedValue(account),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      assetLedger: {
        findUnique: vi.fn().mockImplementation(async () => createdLedger),
        create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          createdLedger = {
            ...data,
            id: 'ledger-1',
            account: { ownerType: 'MERCHANT', ownerId: 'merchant-1', assetType: 'SETTLEMENT' },
            operatorId: data.operatorId ?? null,
            remark: data.remark ?? null,
            createdAt: new Date('2026-08-11T00:00:00.000Z')
          };
          return createdLedger;
        })
      }
    };
    const service = new FinanceAssetService({} as PrismaService);

    const result = await service.applyChange(tx as never, {
      accountId: 'account-1',
      requestId: 'request-1',
      businessType: 'settlement_paid',
      businessId: 'settlement-1',
      changeType: 'credit',
      changeAmount: 900n,
      operatorId: 'admin'
    });

    expect(result).toMatchObject({
      beforeBalance: '1000',
      changeAmount: '900',
      afterBalance: '1900'
    });
    expect(tx.account.updateMany).toHaveBeenCalledWith({
      where: { id: 'account-1', balance: 1000n, frozenBalance: 200n },
      data: { balance: 1900n, frozenBalance: 200n }
    });

    const replay = await service.applyChange(tx as never, {
      accountId: 'account-1',
      requestId: 'request-1',
      businessType: 'settlement_paid',
      businessId: 'settlement-1',
      changeType: 'credit',
      changeAmount: 900n
    });
    expect(replay).toEqual(result);
    expect(tx.assetLedger.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a debit that would consume frozen balance', async () => {
    const tx = {
      account: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'account-1',
          ownerType: 'USER',
          ownerId: 'member-1',
          assetType: 'CASH',
          balance: 1000n,
          frozenBalance: 900n
        })
      },
      assetLedger: { findUnique: vi.fn().mockResolvedValue(null) }
    };
    const service = new FinanceAssetService({} as PrismaService);

    await expect(
      service.applyChange(tx as never, {
        accountId: 'account-1',
        requestId: 'request-2',
        businessType: 'refund',
        businessId: 'refund-1',
        changeType: 'debit',
        changeAmount: -200n
      })
    ).rejects.toThrow('余额不能低于冻结余额');
  });

  it('creates a reconciliation batch with exact fen-level difference', async () => {
    const create = vi.fn().mockImplementation(async ({ data }: { data: Record<string, any> }) => ({
      id: 'batch-1',
      batchNo: data.batchNo,
      channel: data.channel,
      businessDate: data.businessDate,
      totalRecords: data.totalRecords,
      matchedRecords: data.matchedRecords,
      diffRecords: data.diffRecords,
      status: data.status,
      createdAt: new Date('2026-08-11T00:00:00.000Z')
    }));
    const prisma = {
      reconciliationBatch: { findUnique: vi.fn().mockResolvedValue(null), create },
      reconciliationDiff: {},
      settlement: {},
      profitSharingOrder: {},
      account: {}
    } as unknown as PrismaService;
    const service = new FinanceOperationsService(prisma, {} as FinanceAssetService);

    const result = await service.createBatch(
      {
        channel: 'wechat',
        businessDate: '2026-08-10',
        totalRecords: 2,
        matchedRecords: 1,
        diffs: [
          {
            businessType: 'payment',
            businessId: 'order-1',
            platformAmountFen: '10000',
            channelAmountFen: '10020',
            diffType: 'amount'
          }
        ]
      },
      'reconciliation-request-1'
    );

    expect(result).toMatchObject({
      batchNo: expect.any(String),
      status: 'has_diff',
      diffRecords: 1
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalRecords: 2,
          matchedRecords: 1,
          diffRecords: 1,
          status: 'has_diff',
          diffs: {
            create: [
              expect.objectContaining({
                platformAmountFen: 10000n,
                channelAmountFen: 10020n,
                diffAmountFen: 20n
              })
            ]
          }
        })
      })
    );
  });
});
