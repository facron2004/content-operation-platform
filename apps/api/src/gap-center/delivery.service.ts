import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { newEntityId } from '../common/id';
import type { BulkShipDto, CreateDeliveryDto, GapListQueryDto, UpdateDeliveryDto } from './gap-center.dto';
import { maskPhone, nullableDate, pageResult } from './gap-center.utils';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DeliveryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query: GapListQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.DeliveryWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { deliveryNo: { contains: search } },
              { orderId: { contains: search } },
              { trackingNo: { contains: search } }
            ]
          }
        : {})
    };
    const skip = (query.page - 1) * query.pageSize;
    const [total, rows] = await Promise.all([
      this.prisma.delivery.count({ where }),
      this.prisma.delivery.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take: query.pageSize })
    ]);
    const orders = await this.loadOrders(rows.map((row) => row.orderId));
    return pageResult(rows.map((row) => this.mapDelivery(row, orders.get(row.orderId))), query.page, query.pageSize, total);
  }

  async get(deliveryId: string) {
    const row = await this.prisma.delivery.findUnique({ where: { deliveryId } });
    if (!row) throw new NotFoundException('物流单不存在');
    const orders = await this.loadOrders([row.orderId]);
    return this.mapDelivery(row, orders.get(row.orderId));
  }

  async create(dto: CreateDeliveryDto) {
    const order = await this.prisma.orderHeader.findUnique({
      where: { orderId: dto.orderId },
      select: { orderId: true, orderCode: true, merchantName: true }
    });
    if (!order) throw new BadRequestException('订单不存在，无法创建物流单');
    const existing = await this.prisma.delivery.findFirst({
      where: { orderId: dto.orderId, status: { notIn: ['cancelled', 'delivered'] } },
      select: { deliveryNo: true }
    });
    if (existing) throw new ConflictException(`该订单已有进行中的物流单：${existing.deliveryNo}`);
    const row = await this.prisma.delivery.create({
      data: {
        deliveryId: newEntityId('delivery'),
        deliveryNo: `DL-${newEntityId().replace('-', '').slice(-14).toUpperCase()}`,
        orderId: dto.orderId.trim(),
        receiverName: dto.receiverName?.trim(),
        receiverMobile: dto.receiverMobile?.trim(),
        province: dto.province?.trim(),
        city: dto.city?.trim(),
        district: dto.district?.trim(),
        address: dto.address?.trim()
      }
    });
    return this.mapDelivery(row, order);
  }

  async update(deliveryId: string, dto: UpdateDeliveryDto) {
    const existing = await this.prisma.delivery.findUnique({ where: { deliveryId } });
    if (!existing) throw new NotFoundException('物流单不存在');
    const status = dto.status ?? existing.status;
    const now = new Date();
    const row = await this.prisma.delivery.update({
      where: { deliveryId },
      data: {
        logisticsCompany: dto.logisticsCompany?.trim(),
        trackingNo: dto.trackingNo?.trim(),
        status,
        exceptionReason: dto.exceptionReason?.trim(),
        shippedAt: status === 'shipped' && !existing.shippedAt ? now : existing.shippedAt,
        receivedAt: status === 'delivered' && !existing.receivedAt ? now : existing.receivedAt
      }
    });
    const orders = await this.loadOrders([row.orderId]);
    return this.mapDelivery(row, orders.get(row.orderId));
  }

  async bulkShip(dto: BulkShipDto) {
    const ids = dto.items.map((item) => item.deliveryId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('批量发货明细不能重复');
    const existing = await this.prisma.delivery.findMany({ where: { deliveryId: { in: ids } } });
    if (existing.length !== ids.length) throw new BadRequestException('部分物流单不存在');
    const now = new Date();
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.delivery.update({
          where: { deliveryId: item.deliveryId },
          data: {
            logisticsCompany: item.logisticsCompany.trim(),
            trackingNo: item.trackingNo.trim(),
            status: 'shipped',
            shippedAt: now,
            exceptionReason: null
          }
        })
      )
    );
    return { updated: ids.length, items: await Promise.all(ids.map((id) => this.get(id))) };
  }

  private async loadOrders(orderIds: string[]) {
    const ids = [...new Set(orderIds)];
    if (!ids.length) return new Map<string, { orderId: string; orderCode: string | null; merchantName: string | null }>();
    const rows = await this.prisma.orderHeader.findMany({
      where: { orderId: { in: ids } },
      select: { orderId: true, orderCode: true, merchantName: true }
    });
    return new Map(rows.map((row) => [row.orderId, row]));
  }

  private mapDelivery(
    row: {
      deliveryId: string;
      deliveryNo: string;
      orderId: string;
      receiverName: string | null;
      receiverMobile: string | null;
      province: string | null;
      city: string | null;
      district: string | null;
      address: string | null;
      logisticsCompany: string | null;
      trackingNo: string | null;
      status: string;
      exceptionReason: string | null;
      shippedAt: Date | null;
      receivedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    },
    order?: { orderId: string; orderCode: string | null; merchantName: string | null }
  ) {
    return {
      deliveryId: row.deliveryId,
      deliveryNo: row.deliveryNo,
      orderId: row.orderId,
      orderCode: order?.orderCode ?? null,
      merchantName: order?.merchantName ?? null,
      receiverName: row.receiverName,
      receiverMobile: maskPhone(row.receiverMobile),
      address: [row.province, row.city, row.district, row.address].filter(Boolean).join(' ') || null,
      logisticsCompany: row.logisticsCompany,
      trackingNo: row.trackingNo,
      status: row.status,
      exceptionReason: row.exceptionReason,
      shippedAt: nullableDate(row.shippedAt),
      receivedAt: nullableDate(row.receivedAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  }
}
