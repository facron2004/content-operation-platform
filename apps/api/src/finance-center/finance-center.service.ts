import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { FinanceDateQueryDto, FinanceLedgerQueryDto } from './finance-center.dto';
import type {
  FinanceDashboardPayload,
  FinanceLedgerItem,
  FinanceLedgerPayload
} from './finance-center.types';

type FenValue = bigint | number | null | undefined;

function fenToString(value: FenValue): string {
  return String(value ?? 0);
}

function dateToString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function toDate(value: string, end = false): Date {
  const parsed = new Date(`${value}T00:00:00+08:00`);
  if (end) parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed;
}

function dateRange(query: FinanceDateQueryDto): {
  from: Date | undefined;
  toExclusive: Date | undefined;
} {
  return {
    from: query.dateFrom ? toDate(query.dateFrom) : undefined,
    toExclusive: query.dateTo ? toDate(query.dateTo, true) : undefined
  };
}

function withDateRange(
  current: Prisma.DateTimeNullableFilter = { not: null },
  query: FinanceDateQueryDto
): Prisma.DateTimeNullableFilter {
  const { from, toExclusive } = dateRange(query);
  return {
    ...current,
    ...(from ? { gte: from } : {}),
    ...(toExclusive ? { lt: toExclusive } : {})
  };
}

function orderSearch(search?: string): Prisma.OrderHeaderWhereInput {
  const value = search?.trim();
  if (!value) return {};
  return {
    OR: [
      { orderId: { contains: value } },
      { orderCode: { contains: value } },
      { memberId: { contains: value } },
      { merchantName: { contains: value } }
    ]
  };
}

@Injectable()
export class FinanceCenterService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getDashboard(query: FinanceDateQueryDto): Promise<FinanceDashboardPayload> {
    const paidWhere: Prisma.OrderHeaderWhereInput = {
      paidTime: withDateRange({ not: null }, query)
    };
    const refundWhere: Prisma.OrderHeaderWhereInput = {
      refundTime: withDateRange({ not: null }, query),
      refundAmountFen: { gt: 0 }
    };
    const verifiedWhere: Prisma.OrderHeaderWhereInput = {
      verifyTime: withDateRange({ not: null }, query)
    };

    const [paid, refunds, verified, memberAssets] = await Promise.all([
      this.prisma.orderHeader.aggregate({
        where: paidWhere,
        _count: { _all: true },
        _sum: {
          paidAmountFen: true,
          paidAmountWalletFen: true,
          paidAmountBonusFen: true,
          paidAmountCardFen: true
        }
      }),
      this.prisma.orderHeader.aggregate({
        where: refundWhere,
        _count: { _all: true },
        _sum: { refundAmountFen: true }
      }),
      this.prisma.orderHeader.aggregate({
        where: verifiedWhere,
        _count: { _all: true },
        _sum: { verifyAmountFen: true }
      }),
      this.prisma.member.aggregate({
        _count: { _all: true },
        _sum: { walletBalanceFen: true, pointsBalance: true }
      })
    ]);

    const onlineFen = paid._sum.paidAmountFen ?? 0n;
    const walletFen = paid._sum.paidAmountWalletFen ?? 0n;

    return {
      period: {
        dateFrom: query.dateFrom ?? null,
        dateTo: query.dateTo ?? null
      },
      metrics: {
        paidOrderCount: paid._count._all,
        paidGrossFen: fenToString(BigInt(onlineFen) + BigInt(walletFen)),
        refundOrderCount: refunds._count._all,
        refundFen: fenToString(refunds._sum.refundAmountFen),
        verifiedOrderCount: verified._count._all,
        verifiedFen: fenToString(verified._sum.verifyAmountFen),
        walletAssetFen: fenToString(memberAssets._sum.walletBalanceFen),
        pointAsset: Number(memberAssets._sum.pointsBalance ?? 0),
        memberCount: memberAssets._count._all
      },
      channels: {
        onlineFen: fenToString(onlineFen),
        walletFen: fenToString(walletFen),
        bonusFen: fenToString(paid._sum.paidAmountBonusFen),
        cardFen: fenToString(paid._sum.paidAmountCardFen)
      },
      capabilities: {
        orderLedger: 'ready',
        assetLedger: 'not_connected',
        settlement: 'not_connected',
        profitSharing: 'not_connected',
        reconciliation: 'not_connected'
      },
      dataSources: ['OrderHeader', 'Member']
    };
  }

  async getLedger(query: FinanceLedgerQueryDto): Promise<FinanceLedgerPayload> {
    const search = query.keyword?.trim();
    const commonWhere = orderSearch(search);
    const paidWhere: Prisma.OrderHeaderWhereInput = {
      ...commonWhere,
      paidTime: withDateRange({ not: null }, query)
    };
    const refundWhere: Prisma.OrderHeaderWhereInput = {
      ...commonWhere,
      refundTime: withDateRange({ not: null }, query),
      refundAmountFen: { gt: 0 }
    };
    const take = query.page * query.pageSize;

    const [paidCount, refundCount, paidRows, refundRows] = await Promise.all([
      query.eventType === 'refund' ? 0 : this.prisma.orderHeader.count({ where: paidWhere }),
      query.eventType === 'payment' ? 0 : this.prisma.orderHeader.count({ where: refundWhere }),
      query.eventType === 'refund'
        ? []
        : this.prisma.orderHeader.findMany({
            where: paidWhere,
            orderBy: [{ paidTime: 'desc' }, { orderTime: 'desc' }],
            take,
            select: {
              orderId: true,
              orderCode: true,
              merchantName: true,
              memberId: true,
              paidTime: true,
              paidAmountFen: true,
              paidAmountWalletFen: true,
              channel: true,
              status: true
            }
          }),
      query.eventType === 'payment'
        ? []
        : this.prisma.orderHeader.findMany({
            where: refundWhere,
            orderBy: [{ refundTime: 'desc' }, { orderTime: 'desc' }],
            take,
            select: {
              orderId: true,
              orderCode: true,
              merchantName: true,
              memberId: true,
              refundTime: true,
              refundAmountFen: true,
              channel: true,
              status: true
            }
          })
    ]);

    const paidItems: FinanceLedgerItem[] = paidRows.map((row) => ({
      eventId: `${row.orderId}:payment`,
      eventType: 'payment',
      orderId: row.orderId,
      orderCode: row.orderCode,
      merchantName: row.merchantName,
      memberId: row.memberId,
      occurredAt: dateToString(row.paidTime) ?? '',
      changeAmountFen: fenToString(
        BigInt(row.paidAmountFen ?? 0n) + BigInt(row.paidAmountWalletFen ?? 0n)
      ),
      channel: row.channel,
      status: row.status,
      remark: '订单支付'
    }));
    const refundItems: FinanceLedgerItem[] = refundRows.map((row) => ({
      eventId: `${row.orderId}:refund`,
      eventType: 'refund',
      orderId: row.orderId,
      orderCode: row.orderCode,
      merchantName: row.merchantName,
      memberId: row.memberId,
      occurredAt: dateToString(row.refundTime) ?? '',
      changeAmountFen: `-${fenToString(row.refundAmountFen)}`,
      channel: row.channel,
      status: row.status,
      remark: '订单退款'
    }));
    const items = [...paidItems, ...refundItems]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
    const total = paidCount + refundCount;

    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        hasMore: query.page * query.pageSize < total
      },
      dataSources: ['OrderHeader']
    };
  }
}
