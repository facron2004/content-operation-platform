import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UserCenterListQueryDto } from './user-center.dto';
import type {
  UserCenterMemberDetail,
  UserCenterMemberItem,
  UserCenterListPayload
} from './user-center.types';
import { sqlDatetime } from '../common/sqlite-datetime';

const DETAIL_ORDER_LIMIT = 10;
const DETAIL_LEDGER_LIMIT = 10;

export function maskMemberPhone(phone: string | null | undefined): string | null {
  const normalized = phone?.trim();
  if (!normalized) return null;
  if (normalized.length <= 7) return `${normalized.slice(0, 2)}****`;
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

function fenToString(value: bigint | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toString();
}

function dateToString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

type MemberRow = {
  memberId: string;
  nickname: string | null;
  phone: string | null;
  level: string | null;
  pointsBalance: number;
  walletBalanceFen: bigint | null;
  totalGmvFen: bigint | null;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
  totalOrders: number;
  tags: string | null;
};

type MemberOrderSummary = {
  totalOrders: number;
  totalGmvFen: bigint | null;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
};

type RawMemberOrderAggregate = {
  memberId: string;
  totalOrders: number | bigint;
  totalGmvFen: bigint | number | null;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
};

function parseSqliteDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fenBigIntOrNull(value: bigint | number | null | undefined): bigint | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'bigint' ? value : BigInt(Math.trunc(value));
}

function mapMember(
  member: MemberRow,
  paidOrderCount = 0,
  paidGmvFen: bigint | null = null,
  orderSummary: MemberOrderSummary = {
    totalOrders: member.totalOrders,
    totalGmvFen: member.totalGmvFen,
    firstOrderAt: member.firstOrderAt,
    lastOrderAt: member.lastOrderAt
  }
): UserCenterMemberItem {
  return {
    memberId: member.memberId,
    nickname: member.nickname,
    phone: maskMemberPhone(member.phone),
    level: member.level,
    pointsBalance: member.pointsBalance,
    walletBalanceFen: fenToString(member.walletBalanceFen),
    totalGmvFen: fenToString(orderSummary.totalGmvFen),
    totalOrders: orderSummary.totalOrders,
    paidOrderCount,
    paidGmvFen: fenToString(paidGmvFen),
    firstOrderAt: dateToString(orderSummary.firstOrderAt),
    lastOrderAt: dateToString(orderSummary.lastOrderAt),
    tags: member.tags
  };
}

@Injectable()
export class UserCenterService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listMembers(query: UserCenterListQueryDto): Promise<UserCenterListPayload> {
    const search = query.search?.trim();
    const where = {
      ...(query.level?.trim() ? { level: query.level.trim() } : {}),
      ...(search
        ? {
            OR: [
              { memberId: { contains: search } },
              { nickname: { contains: search } },
              { phone: { contains: search } }
            ]
          }
        : {})
    };
    const skip = (query.page - 1) * query.pageSize;

    const [total, matchingMembers] = await Promise.all([
      this.prisma.member.count({ where }),
      this.prisma.member.findMany({ where, select: { memberId: true } })
    ]);

    const matchingMemberIds = matchingMembers.map((member) => member.memberId);
    const activeSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const orderAggregates = matchingMemberIds.length
      ? await this.prisma.$queryRawUnsafe<RawMemberOrderAggregate[]>(
          `SELECT
             "memberId" AS "memberId",
             COUNT(*) AS "totalOrders",
             SUM(CASE WHEN "paidTime" IS NOT NULL THEN COALESCE("paidAmountFen", 0) ELSE 0 END) AS "totalGmvFen",
             MIN(${sqlDatetime('"orderTime"')}) AS "firstOrderAt",
             MAX(${sqlDatetime('"orderTime"')}) AS "lastOrderAt"
           FROM "OrderHeader"
           WHERE "memberId" IN (${matchingMemberIds.map(() => '?').join(',')})
           GROUP BY "memberId"`,
          ...matchingMemberIds
        )
      : [];
    const [paidOrders, activePaidOrders] = matchingMemberIds.length
      ? await Promise.all([
          this.prisma.orderHeader.groupBy({
            by: ['memberId'],
            where: { memberId: { in: matchingMemberIds }, paidTime: { not: null } },
            _count: { _all: true },
            _sum: { paidAmountFen: true }
          }),
          this.prisma.orderHeader.groupBy({
            by: ['memberId'],
            where: {
              memberId: { in: matchingMemberIds },
              paidTime: { gte: activeSince }
            },
            _count: { _all: true }
          })
        ])
      : [[], []];
    const orderByMember = new Map(
      orderAggregates.map((row) => [
        row.memberId,
        {
          totalOrders: Number(row.totalOrders),
          totalGmvFen: fenBigIntOrNull(row.totalGmvFen),
          firstOrderAt: parseSqliteDate(row.firstOrderAt),
          lastOrderAt: parseSqliteDate(row.lastOrderAt)
        }
      ])
    );
    const paidByMember = new Map(
      paidOrders.map((row) => [
        row.memberId,
        { count: row._count._all, gmvFen: row._sum.paidAmountFen }
      ])
    );
    const orderedMemberIds = [...matchingMemberIds].sort((leftMemberId, rightMemberId) => {
      const leftOrderTime = orderByMember.get(leftMemberId)?.lastOrderAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      const rightOrderTime = orderByMember.get(rightMemberId)?.lastOrderAt?.getTime() ?? Number.NEGATIVE_INFINITY;
      if (leftOrderTime === rightOrderTime) return 0;
      return rightOrderTime > leftOrderTime ? 1 : -1;
    });
    const pageMemberIds = orderedMemberIds.slice(skip, skip + query.pageSize);
    const pageMembers = pageMemberIds.length
      ? await this.prisma.member.findMany({ where: { memberId: { in: pageMemberIds } } })
      : [];
    const memberById = new Map(pageMembers.map((member) => [member.memberId, member]));
    const orderedMembers = pageMemberIds
      .map((memberId) => memberById.get(memberId))
      .filter((member): member is (typeof pageMembers)[number] => Boolean(member));

    return {
      items: orderedMembers.map((member) => {
        const paid = paidByMember.get(member.memberId);
        return mapMember(
          member,
          paid?.count ?? 0,
          paid?.gmvFen ?? null,
          orderByMember.get(member.memberId) ?? {
            totalOrders: 0,
            totalGmvFen: null,
            firstOrderAt: null,
            lastOrderAt: null
          }
        );
      }),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        hasMore: skip + pageMemberIds.length < total
      },
      summary: {
        totalMembers: total,
        paidMembers: paidOrders.length,
        activeMembers30d: activePaidOrders.length,
        totalOrders: orderAggregates.reduce((sum, row) => sum + Number(row.totalOrders), 0),
        totalGmvFen: fenToString(
          orderAggregates.reduce<bigint | null>((sum, row) => {
            const amount = fenBigIntOrNull(row.totalGmvFen);
            return amount === null ? sum : (sum ?? 0n) + amount;
          }, null)
        )
      },
      dataSources: ['Member', 'OrderHeader']
    };
  }

  async getMember(memberId: string): Promise<UserCenterMemberDetail> {
    const member = await this.prisma.member.findUnique({ where: { memberId } });
    if (!member) throw new NotFoundException('用户不存在');

    const [orders, pointLedgers, orderSummaryRows, paidSummaryRows] = await Promise.all([
      this.prisma.orderHeader.findMany({
        where: { memberId },
        orderBy: { orderTime: 'desc' },
        take: DETAIL_ORDER_LIMIT,
        select: {
          orderId: true,
          orderCode: true,
          orderTime: true,
          paidTime: true,
          verifyTime: true,
          refundTime: true,
          status: true,
          merchantName: true,
          packageId: true,
          orderAmountFen: true,
          paidAmountFen: true,
          refundAmountFen: true
        }
      }),
      this.prisma.memberPointLedger.findMany({
        where: { memberId },
        orderBy: { occurredAt: 'desc' },
        take: DETAIL_LEDGER_LIMIT,
        select: { id: true, delta: true, balance: true, reason: true, occurredAt: true }
      }),
      this.prisma.$queryRawUnsafe<RawMemberOrderAggregate[]>(
        `SELECT
           COUNT(*) AS "totalOrders",
           SUM(CASE WHEN "paidTime" IS NOT NULL THEN COALESCE("paidAmountFen", 0) ELSE 0 END) AS "totalGmvFen",
           MIN(${sqlDatetime('"orderTime"')}) AS "firstOrderAt",
           MAX(${sqlDatetime('"orderTime"')}) AS "lastOrderAt"
         FROM "OrderHeader"
         WHERE "memberId" = ?`,
        memberId
      ),
      this.prisma.$queryRawUnsafe<Array<{ paidOrderCount: number | bigint; paidGmvFen: bigint | number | null }>>(
        `SELECT
           COUNT(*) AS "paidOrderCount",
           SUM(COALESCE("paidAmountFen", 0)) AS "paidGmvFen"
         FROM "OrderHeader"
         WHERE "memberId" = ? AND "paidTime" IS NOT NULL`,
        memberId
      )
    ]);
    const orderSummary = orderSummaryRows[0] ?? {
      totalOrders: 0,
      totalGmvFen: null,
      firstOrderAt: null,
      lastOrderAt: null
    };
    const paidSummary = paidSummaryRows[0] ?? { paidOrderCount: 0, paidGmvFen: null };

    return {
      member: mapMember(member, Number(paidSummary.paidOrderCount), fenBigIntOrNull(paidSummary.paidGmvFen), {
        totalOrders: Number(orderSummary.totalOrders),
        totalGmvFen: fenBigIntOrNull(orderSummary.totalGmvFen),
        firstOrderAt: parseSqliteDate(orderSummary.firstOrderAt),
        lastOrderAt: parseSqliteDate(orderSummary.lastOrderAt)
      }),
      orders: orders.map((order) => ({
        orderId: order.orderId,
        orderCode: order.orderCode,
        orderTime: order.orderTime.toISOString(),
        paidTime: dateToString(order.paidTime),
        verifyTime: dateToString(order.verifyTime),
        refundTime: dateToString(order.refundTime),
        status: order.status,
        merchantName: order.merchantName,
        packageId: order.packageId,
        orderAmountFen: fenToString(order.orderAmountFen),
        paidAmountFen: fenToString(order.paidAmountFen),
        refundAmountFen: fenToString(order.refundAmountFen)
      })),
      pointLedgers: pointLedgers.map((ledger) => ({
        id: ledger.id,
        delta: ledger.delta,
        balance: ledger.balance,
        reason: ledger.reason,
        occurredAt: ledger.occurredAt.toISOString()
      })),
      dataSources: ['Member', 'OrderHeader', 'MemberPointLedger']
    };
  }
}
