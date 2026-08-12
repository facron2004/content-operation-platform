import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { newEntityId } from '../common/id';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceAssetService } from './finance-asset.service';
import type {
  CompleteProfitSharingDto,
  CreateProfitSharingDto,
  CreateReconciliationBatchDto,
  CreateSettlementDto,
  ProfitSharingQueryDto,
  ReconciliationQueryDto,
  ResolveReconciliationDiffDto,
  SettlementQueryDto,
  SettlementReviewDto
} from './finance-operations.dto';
import type {
  FinanceOperationsSummary,
  FinancePage,
  FinanceSettlementView,
  ProfitSharingView,
  ReconciliationBatchView,
  ReconciliationDiffView
} from './finance-operations.types';

type FinanceDb = PrismaService | Prisma.TransactionClient;
type FinanceActor = { userId?: string };

function toDate(value: string, end = false): Date {
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('日期格式无效');
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function fen(value: bigint | null | undefined): bigint {
  return value ?? 0n;
}

function dateString(value: Date | null | undefined): string | null {
  return value?.toISOString() ?? null;
}

function periodEndString(value: Date): string {
  return new Date(value.getTime() - 24 * 60 * 60 * 1000).toISOString();
}

function mapSettlement(row: {
  id: string;
  settlementNo: string;
  merchantId: string;
  periodStart: Date;
  periodEnd: Date;
  totalAmountFen: bigint;
  serviceFeeFen: bigint;
  settlementAmountFen: bigint;
  status: string;
  approvedBy: string | null;
  paidAt: Date | null;
  thirdPartyPaymentId: string | null;
  remark: string | null;
  createdAt: Date;
  _count: { items: number };
}): FinanceSettlementView {
  return {
    id: row.id,
    settlementNo: row.settlementNo,
    merchantId: row.merchantId,
    periodStart: row.periodStart.toISOString(),
    periodEnd: periodEndString(row.periodEnd),
    totalAmountFen: row.totalAmountFen.toString(),
    serviceFeeFen: row.serviceFeeFen.toString(),
    settlementAmountFen: row.settlementAmountFen.toString(),
    status: row.status,
    approvedBy: row.approvedBy,
    paidAt: dateString(row.paidAt),
    thirdPartyPaymentId: row.thirdPartyPaymentId,
    itemCount: row._count.items,
    remark: row.remark,
    createdAt: row.createdAt.toISOString()
  };
}

function mapProfit(row: {
  id: string;
  sharingNo: string;
  orderId: string;
  sharingType: string;
  totalAmountFen: bigint;
  platformAmountFen: bigint;
  merchantAmountFen: bigint;
  charityAmountFen: bigint;
  status: string;
  thirdPartyTransactionId: string | null;
  retryCount: number;
  requestId: string;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ProfitSharingView {
  return {
    id: row.id,
    sharingNo: row.sharingNo,
    orderId: row.orderId,
    sharingType: row.sharingType,
    totalAmountFen: row.totalAmountFen.toString(),
    platformAmountFen: row.platformAmountFen.toString(),
    merchantAmountFen: row.merchantAmountFen.toString(),
    charityAmountFen: row.charityAmountFen.toString(),
    status: row.status,
    thirdPartyTransactionId: row.thirdPartyTransactionId,
    retryCount: row.retryCount,
    requestId: row.requestId,
    failureReason: row.failureReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function mapBatch(row: {
  id: string;
  batchNo: string;
  channel: string;
  businessDate: string;
  totalRecords: number;
  matchedRecords: number;
  diffRecords: number;
  status: string;
  createdAt: Date;
}): ReconciliationBatchView {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

function mapDiff(row: {
  id: string;
  batchId: string;
  businessType: string;
  businessId: string;
  platformAmountFen: bigint;
  channelAmountFen: bigint;
  diffAmountFen: bigint;
  diffType: string;
  status: string;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  remark: string | null;
  createdAt: Date;
}): ReconciliationDiffView {
  return {
    id: row.id,
    batchId: row.batchId,
    businessType: row.businessType,
    businessId: row.businessId,
    platformAmountFen: row.platformAmountFen.toString(),
    channelAmountFen: row.channelAmountFen.toString(),
    diffAmountFen: row.diffAmountFen.toString(),
    diffType: row.diffType,
    status: row.status,
    resolvedBy: row.resolvedBy,
    resolvedAt: dateString(row.resolvedAt),
    remark: row.remark,
    createdAt: row.createdAt.toISOString()
  };
}

@Injectable()
export class FinanceOperationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FinanceAssetService) private readonly assets: FinanceAssetService
  ) {}

  async getSummary(): Promise<FinanceOperationsSummary> {
    const [
      pendingSettlement,
      settled,
      pendingProfit,
      failedProfit,
      openDiffs,
      accountCount,
      benefit,
      point,
      pickup
    ] = await Promise.all([
      this.prisma.settlement.aggregate({
        where: { status: { in: ['pending_approval', 'approved'] } },
        _sum: { settlementAmountFen: true }
      }),
      this.prisma.settlement.aggregate({
        where: { status: 'paid' },
        _sum: { settlementAmountFen: true }
      }),
      this.prisma.profitSharingOrder.aggregate({
        where: { status: { in: ['pending', 'processing', 'manual_required'] } },
        _sum: { totalAmountFen: true }
      }),
      this.prisma.profitSharingOrder.count({
        where: { status: { in: ['failed', 'manual_required'] } }
      }),
      this.prisma.reconciliationDiff.count({ where: { status: 'open' } }),
      this.prisma.account.count({ where: { status: 'active' } }),
      this.prisma.account.aggregate({
        where: { assetType: 'BENEFIT', status: 'active' },
        _sum: { balance: true }
      }),
      this.prisma.account.aggregate({
        where: { assetType: 'POINT', status: 'active' },
        _sum: { balance: true }
      }),
      this.prisma.account.aggregate({
        where: { assetType: 'PICKUP_POINT', status: 'active' },
        _sum: { balance: true }
      })
    ]);
    return {
      pendingSettlementFen: fen(pendingSettlement._sum.settlementAmountFen).toString(),
      settledFen: fen(settled._sum.settlementAmountFen).toString(),
      pendingProfitSharingFen: fen(pendingProfit._sum.totalAmountFen).toString(),
      failedProfitSharingCount: failedProfit,
      openReconciliationDiffCount: openDiffs,
      assetAccountCount: accountCount,
      benefitBalanceFen: fen(benefit._sum.balance).toString(),
      pointBalance: fen(point._sum.balance).toString(),
      pickupPointBalance: fen(pickup._sum.balance).toString()
    };
  }

  async listSettlements(query: SettlementQueryDto): Promise<FinancePage<FinanceSettlementView>> {
    const where: Prisma.SettlementWhereInput = {
      ...(query.merchantId ? { merchantId: query.merchantId.trim() } : {}),
      ...(query.status ? { status: query.status } : {})
    };
    const skip = (query.page - 1) * query.pageSize;
    const [total, rows] = await Promise.all([
      this.prisma.settlement.count({ where }),
      this.prisma.settlement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.pageSize,
        include: { _count: { select: { items: true } } }
      })
    ]);
    return {
      items: rows.map(mapSettlement),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        hasMore: skip + rows.length < total
      }
    };
  }

  async getSettlement(id: string): Promise<FinanceSettlementView> {
    const row = await this.prisma.settlement.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } }
    });
    if (!row) throw new NotFoundException('结算单不存在');
    return mapSettlement(row);
  }

  async createSettlement(
    dto: CreateSettlementDto,
    actor: FinanceActor
  ): Promise<FinanceSettlementView> {
    const periodStart = toDate(dto.periodStart);
    const periodEnd = toDate(dto.periodEnd, true);
    if (periodEnd <= periodStart) throw new BadRequestException('结算周期必须为正向区间');
    const existing = await this.prisma.settlement.findFirst({
      where: {
        merchantId: dto.merchantId,
        periodStart,
        periodEnd,
        status: { not: 'failed' }
      },
      include: { _count: { select: { items: true } } }
    });
    if (existing) return mapSettlement(existing);
    const records = await this.prisma.verificationRecord.findMany({
      where: {
        merchantId: dto.merchantId,
        status: 'verified',
        verifiedAt: { gte: periodStart, lt: periodEnd },
        settlementItems: { none: {} }
      },
      select: { id: true, orderId: true, amountFen: true }
    });
    if (!records.length) throw new ConflictException('该周期没有可结算的核销记录');
    const rate = BigInt(dto.serviceFeeRateBps);
    const total = records.reduce((sum, record) => sum + record.amountFen, 0n);
    const serviceFee = records.reduce(
      (sum, record) => sum + (record.amountFen * rate) / 10000n,
      0n
    );
    const settlementAmount = total - serviceFee;
    const row = await this.prisma.settlement.create({
      data: {
        settlementNo: newEntityId('stl'),
        merchantId: dto.merchantId.trim(),
        periodStart,
        periodEnd,
        totalAmountFen: total,
        serviceFeeFen: serviceFee,
        settlementAmountFen: settlementAmount,
        status: 'pending_approval',
        remark:
          [dto.remark?.trim(), `创建人：${actor.userId ?? 'unknown'}`].filter(Boolean).join('；') ||
          null,
        items: {
          create: records.map((record) => {
            const itemFee = (record.amountFen * rate) / 10000n;
            return {
              orderId: record.orderId,
              verificationId: record.id,
              amountFen: record.amountFen,
              serviceFeeFen: itemFee,
              netAmountFen: record.amountFen - itemFee
            };
          })
        }
      },
      include: { _count: { select: { items: true } } }
    });
    return mapSettlement(row);
  }

  async approveSettlement(
    id: string,
    dto: SettlementReviewDto,
    actor: FinanceActor
  ): Promise<FinanceSettlementView> {
    const row = await this.prisma.settlement.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } }
    });
    if (!row) throw new NotFoundException('结算单不存在');
    if (row.status === 'approved' || row.status === 'paid') return mapSettlement(row);
    if (row.status !== 'pending_approval') throw new ConflictException('当前结算单不可审核');
    const updated = await this.prisma.settlement.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy: actor.userId ?? null,
        remark: [row.remark, dto.remark?.trim()].filter(Boolean).join('；') || null
      },
      include: { _count: { select: { items: true } } }
    });
    return mapSettlement(updated);
  }

  async paySettlement(
    id: string,
    dto: { thirdPartyPaymentId: string },
    actor: FinanceActor
  ): Promise<FinanceSettlementView> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.settlement.findUnique({
        where: { id },
        include: { _count: { select: { items: true } } }
      });
      if (!row) throw new NotFoundException('结算单不存在');
      if (row.status === 'paid') return mapSettlement(row);
      if (row.status !== 'approved') throw new ConflictException('结算单必须审核通过后才能付款');
      const account = await this.assets.ensureAccount(tx, {
        ownerType: 'MERCHANT',
        ownerId: row.merchantId,
        assetType: 'SETTLEMENT'
      });
      await this.assets.applyChange(tx, {
        accountId: account.id,
        requestId: `settlement:${row.id}:paid`,
        businessType: 'settlement_paid',
        businessId: row.id,
        changeType: 'credit',
        changeAmount: row.settlementAmountFen,
        operatorId: actor.userId,
        remark: `手工确认第三方付款：${dto.thirdPartyPaymentId.trim()}`
      });
      const updated = await tx.settlement.update({
        where: { id },
        data: {
          status: 'paid',
          paidAt: new Date(),
          thirdPartyPaymentId: dto.thirdPartyPaymentId.trim()
        },
        include: { _count: { select: { items: true } } }
      });
      return mapSettlement(updated);
    });
  }

  async listProfitSharing(query: ProfitSharingQueryDto): Promise<FinancePage<ProfitSharingView>> {
    const where: Prisma.ProfitSharingOrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.orderId ? { orderId: query.orderId.trim() } : {})
    };
    const skip = (query.page - 1) * query.pageSize;
    const [total, rows] = await Promise.all([
      this.prisma.profitSharingOrder.count({ where }),
      this.prisma.profitSharingOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.pageSize
      })
    ]);
    return {
      items: rows.map(mapProfit),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        hasMore: skip + rows.length < total
      }
    };
  }

  async createProfitSharing(
    dto: CreateProfitSharingDto,
    actor: FinanceActor,
    requestId: string
  ): Promise<ProfitSharingView> {
    if (!requestId) throw new BadRequestException('缺少分账幂等键');
    const existing = await this.prisma.profitSharingOrder.findUnique({ where: { requestId } });
    if (existing) return mapProfit(existing);
    const order = await this.prisma.orderHeader.findUnique({
      where: { orderId: dto.orderId },
      select: { orderId: true, orderAmountFen: true, paidAmountFen: true }
    });
    if (!order) throw new NotFoundException('订单不存在');
    const merchantRate = BigInt(dto.merchantRateBps);
    const charityRate = BigInt(dto.charityRateBps);
    if (merchantRate + charityRate > 10000n)
      throw new BadRequestException('商家与公益分账比例之和不能超过 100%');
    const total = fen(order.paidAmountFen ?? order.orderAmountFen);
    if (total <= 0n) throw new ConflictException('订单没有可分账金额');
    const merchant = (total * merchantRate) / 10000n;
    const charity = (total * charityRate) / 10000n;
    const row = await this.prisma.profitSharingOrder.create({
      data: {
        sharingNo: newEntityId('ps'),
        orderId: order.orderId,
        sharingType: dto.sharingType.trim(),
        totalAmountFen: total,
        platformAmountFen: total - merchant - charity,
        merchantAmountFen: merchant,
        charityAmountFen: charity,
        status: 'pending',
        requestId,
        requestParamsJson: JSON.stringify({
          merchantRateBps: dto.merchantRateBps,
          charityRateBps: dto.charityRateBps,
          operatorId: actor.userId ?? null
        })
      }
    });
    return mapProfit(row);
  }

  async triggerProfitSharing(id: string): Promise<ProfitSharingView> {
    const row = await this.prisma.profitSharingOrder.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('分账单不存在');
    if (row.status === 'succeeded') return mapProfit(row);
    const updated = await this.prisma.profitSharingOrder.update({
      where: { id },
      data: {
        status: 'manual_required',
        retryCount: { increment: 1 },
        failureReason: 'ProfitSharingAdapter 尚未接入，未调用第三方',
        responseJson: JSON.stringify({ adapter: 'not_connected' }),
        nextRetryAt: null
      }
    });
    return mapProfit(updated);
  }

  async completeProfitSharing(
    id: string,
    dto: CompleteProfitSharingDto,
    actor: FinanceActor
  ): Promise<ProfitSharingView> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.profitSharingOrder.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('分账单不存在');
      if (row.status === 'succeeded') return mapProfit(row);
      if (!['manual_required', 'failed'].includes(row.status)) {
        throw new ConflictException('分账单必须先记录一次第三方尝试');
      }
      const order = await tx.orderHeader.findUnique({
        where: { orderId: row.orderId },
        select: { merchantId: true }
      });
      const merchantAccount = await this.assets.ensureAccount(tx, {
        ownerType: 'MERCHANT',
        ownerId: order?.merchantId ?? row.orderId,
        assetType: 'SETTLEMENT'
      });
      if (row.merchantAmountFen > 0n) {
        await this.assets.applyChange(tx, {
          accountId: merchantAccount.id,
          requestId: `profit-sharing:${row.id}:merchant`,
          businessType: 'profit_sharing_success',
          businessId: row.id,
          changeType: 'credit',
          changeAmount: row.merchantAmountFen,
          operatorId: actor.userId,
          remark: '分账手工确认完成'
        });
      }
      const updated = await tx.profitSharingOrder.update({
        where: { id },
        data: {
          status: 'succeeded',
          thirdPartyTransactionId: dto.thirdPartyTransactionId.trim(),
          failureReason: null
        }
      });
      return mapProfit(updated);
    });
  }

  async listBatches(query: ReconciliationQueryDto): Promise<FinancePage<ReconciliationBatchView>> {
    const where: Prisma.ReconciliationBatchWhereInput = {
      ...(query.channel ? { channel: query.channel.trim() } : {}),
      ...(query.businessDate ? { businessDate: query.businessDate } : {}),
      ...(query.status ? { status: query.status } : {})
    };
    const skip = (query.page - 1) * query.pageSize;
    const [total, rows] = await Promise.all([
      this.prisma.reconciliationBatch.count({ where }),
      this.prisma.reconciliationBatch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.pageSize
      })
    ]);
    return {
      items: rows.map(mapBatch),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        hasMore: skip + rows.length < total
      }
    };
  }

  async listDiffs(query: ReconciliationQueryDto): Promise<FinancePage<ReconciliationDiffView>> {
    const where: Prisma.ReconciliationDiffWhereInput = {
      ...(query.batchId ? { batchId: query.batchId } : {}),
      ...(query.status ? { status: query.status === 'has_diff' ? 'open' : query.status } : {})
    };
    const skip = (query.page - 1) * query.pageSize;
    const [total, rows] = await Promise.all([
      this.prisma.reconciliationDiff.count({ where }),
      this.prisma.reconciliationDiff.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.pageSize
      })
    ]);
    return {
      items: rows.map(mapDiff),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        hasMore: skip + rows.length < total
      }
    };
  }

  async createBatch(
    dto: CreateReconciliationBatchDto,
    requestId: string
  ): Promise<ReconciliationBatchView> {
    if (!requestId) throw new BadRequestException('缺少对账批次幂等键');
    if (dto.matchedRecords + dto.diffs.length !== dto.totalRecords) {
      throw new BadRequestException('总记录数必须等于已匹配记录数与差异记录数之和');
    }
    const existing = await this.prisma.reconciliationBatch.findUnique({ where: { requestId } });
    if (existing) return mapBatch(existing);
    const row = await this.prisma.reconciliationBatch.create({
      data: {
        batchNo: newEntityId('rec'),
        channel: dto.channel.trim(),
        businessDate: dto.businessDate,
        totalRecords: dto.totalRecords,
        matchedRecords: dto.matchedRecords,
        diffRecords: dto.diffs.length,
        status: dto.diffs.length ? 'has_diff' : 'matched',
        requestId,
        diffs: {
          create: dto.diffs.map((diff) => {
            const platform = BigInt(diff.platformAmountFen);
            const channel = BigInt(diff.channelAmountFen);
            return {
              businessType: diff.businessType,
              businessId: diff.businessId,
              platformAmountFen: platform,
              channelAmountFen: channel,
              diffAmountFen: channel - platform,
              diffType: diff.diffType,
              status: 'open'
            };
          })
        }
      }
    });
    return mapBatch(row);
  }

  async resolveDiff(
    id: string,
    dto: ResolveReconciliationDiffDto,
    actor: FinanceActor
  ): Promise<ReconciliationDiffView> {
    return this.prisma.$transaction(async (tx) => {
      const diff = await tx.reconciliationDiff.findUnique({ where: { id } });
      if (!diff) throw new NotFoundException('对账差异不存在');
      if (diff.status === 'resolved') return mapDiff(diff);
      const updated = await tx.reconciliationDiff.update({
        where: { id },
        data: {
          status: 'resolved',
          resolvedBy: actor.userId ?? null,
          resolvedAt: new Date(),
          remark: dto.remark.trim()
        }
      });
      const open = await tx.reconciliationDiff.count({
        where: { batchId: diff.batchId, status: 'open' }
      });
      if (open === 0)
        await tx.reconciliationBatch.update({
          where: { id: diff.batchId },
          data: { status: 'resolved' }
        });
      return mapDiff(updated);
    });
  }
}
