import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { OrderCenterListQueryDto } from './order-center.dto';
import type {
  OrderCenterDetailPayload,
  OrderCenterItem,
  OrderCenterListPayload
} from './order-center.types';

function fenToString(value: bigint | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toString();
}

function dateToString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

type OrderRow = Prisma.OrderHeaderGetPayload<{
  select: {
    orderId: true;
    orderCode: true;
    memberId: true;
    packageId: true;
    merchantId: true;
    merchantName: true;
    orderTime: true;
    paidTime: true;
    verifyTime: true;
    refundTime: true;
    status: true;
    channel: true;
    orderAmountFen: true;
    paidAmountFen: true;
    refundAmountFen: true;
    verifyAmountFen: true;
  };
}>;

const orderSelect = {
  orderId: true,
  orderCode: true,
  memberId: true,
  packageId: true,
  merchantId: true,
  merchantName: true,
  orderTime: true,
  paidTime: true,
  verifyTime: true,
  refundTime: true,
  status: true,
  channel: true,
  orderAmountFen: true,
  paidAmountFen: true,
  refundAmountFen: true,
  verifyAmountFen: true
} as const;

function mapOrder(
  order: OrderRow,
  memberName: string | null = null,
  packageName: string | null = null
): OrderCenterItem {
  return {
    orderId: order.orderId,
    orderCode: order.orderCode,
    memberId: order.memberId,
    memberName,
    packageId: order.packageId,
    packageName,
    merchantId: order.merchantId,
    merchantName: order.merchantName,
    orderTime: order.orderTime.toISOString(),
    paidTime: dateToString(order.paidTime),
    verifyTime: dateToString(order.verifyTime),
    refundTime: dateToString(order.refundTime),
    status: order.status,
    channel: order.channel,
    orderAmountFen: fenToString(order.orderAmountFen),
    paidAmountFen: fenToString(order.paidAmountFen),
    refundAmountFen: fenToString(order.refundAmountFen),
    verifyAmountFen: fenToString(order.verifyAmountFen)
  };
}

@Injectable()
export class OrderCenterService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listOrders(query: OrderCenterListQueryDto): Promise<OrderCenterListPayload> {
    const search = query.search?.trim();
    const where: Prisma.OrderHeaderWhereInput = {
      ...(query.status?.trim() ? { status: query.status.trim() } : {}),
      ...(search
        ? {
            OR: [
              { orderId: { contains: search } },
              { orderCode: { contains: search } },
              { memberId: { contains: search } },
              { merchantName: { contains: search } }
            ]
          }
        : {})
    };
    const skip = (query.page - 1) * query.pageSize;
    const paidWhere: Prisma.OrderHeaderWhereInput = { ...where, paidTime: { not: null } };
    const verifiedWhere: Prisma.OrderHeaderWhereInput = { ...where, verifyTime: { not: null } };
    const refundedWhere: Prisma.OrderHeaderWhereInput = { ...where, refundTime: { not: null } };

    const [totalOrders, orders, paidOrders, verifiedOrders, refundedOrders, paidAggregate] =
      await Promise.all([
        this.prisma.orderHeader.count({ where }),
        this.prisma.orderHeader.findMany({
          where,
          orderBy: { orderTime: 'desc' },
          skip,
          take: query.pageSize,
          select: orderSelect
        }),
        this.prisma.orderHeader.count({ where: paidWhere }),
        this.prisma.orderHeader.count({ where: verifiedWhere }),
        this.prisma.orderHeader.count({ where: refundedWhere }),
        this.prisma.orderHeader.aggregate({ where: paidWhere, _sum: { paidAmountFen: true } })
      ]);

    const memberIds = [
      ...new Set(orders.map((order) => order.memberId).filter((id): id is string => Boolean(id)))
    ];
    const packageIds = [
      ...new Set(orders.map((order) => order.packageId).filter((id): id is string => Boolean(id)))
    ];
    const [members, packages] = await Promise.all([
      memberIds.length
        ? this.prisma.member.findMany({
            where: { memberId: { in: memberIds } },
            select: { memberId: true, nickname: true }
          })
        : [],
      packageIds.length
        ? this.prisma.contentPackage.findMany({
            where: { packageId: { in: packageIds } },
            select: { packageId: true, packageName: true }
          })
        : []
    ]);
    const memberNames = new Map(members.map((member) => [member.memberId, member.nickname]));
    const packageNames = new Map(
      packages.map((contentPackage) => [contentPackage.packageId, contentPackage.packageName])
    );

    return {
      items: orders.map((order) =>
        mapOrder(
          order,
          order.memberId ? (memberNames.get(order.memberId) ?? null) : null,
          order.packageId ? (packageNames.get(order.packageId) ?? null) : null
        )
      ),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: totalOrders,
        hasMore: skip + orders.length < totalOrders
      },
      summary: {
        totalOrders,
        paidOrders,
        verifiedOrders,
        refundedOrders,
        paidAmountFen: fenToString(paidAggregate._sum.paidAmountFen)
      },
      dataSources: ['OrderHeader', 'Member', 'ContentPackage']
    };
  }

  async getOrder(orderId: string): Promise<OrderCenterDetailPayload> {
    const order = await this.prisma.orderHeader.findUnique({
      where: { orderId },
      select: orderSelect
    });
    if (!order) throw new NotFoundException('订单不存在');

    const [member, contentPackage] = await Promise.all([
      order.memberId
        ? this.prisma.member.findUnique({
            where: { memberId: order.memberId },
            select: { memberId: true, nickname: true, level: true }
          })
        : null,
      order.packageId
        ? this.prisma.contentPackage.findUnique({
            where: { packageId: order.packageId },
            select: {
              packageId: true,
              packageName: true,
              merchantName: true,
              category: true
            }
          })
        : null
    ]);

    return {
      order: mapOrder(order, member?.nickname ?? null, contentPackage?.packageName ?? null),
      member,
      package: contentPackage,
      dataSources: ['OrderHeader', 'Member', 'ContentPackage']
    };
  }
}
