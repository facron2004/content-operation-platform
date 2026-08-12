import { randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { newEntityId } from '../common/id';
import type { CreateCardBatchDto, GapListQueryDto, RedeemCardDto } from './gap-center.dto';
import { hashSecret, nullableDate, optionalDate, pageResult } from './gap-center.utils';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CardService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listBatches(query: GapListQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.CardBatchWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(search ? { OR: [{ batchNo: { contains: search } }, { name: { contains: search } }] } : {})
    };
    const skip = (query.page - 1) * query.pageSize;
    const [total, rows] = await Promise.all([
      this.prisma.cardBatch.count({ where }),
      this.prisma.cardBatch.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: query.pageSize })
    ]);
    const cards = await this.prisma.redemptionCard.groupBy({
      by: ['batchId', 'status'],
      where: { batchId: { in: rows.map((row) => row.batchId) } },
      _count: { _all: true }
    });
    const counts = new Map<string, Record<string, number>>();
    for (const row of cards) {
      const current = counts.get(row.batchId) ?? {};
      current[row.status] = row._count._all;
      counts.set(row.batchId, current);
    }
    return pageResult(
      rows.map((row) => this.mapBatch(row, counts.get(row.batchId) ?? {})),
      query.page,
      query.pageSize,
      total
    );
  }

  async listCards(query: GapListQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.RedemptionCardWhereInput = {
      ...(query.batchId ? { batchId: query.batchId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(search ? { cardNo: { contains: search } } : {})
    };
    const skip = (query.page - 1) * query.pageSize;
    const [total, rows] = await Promise.all([
      this.prisma.redemptionCard.count({ where }),
      this.prisma.redemptionCard.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.pageSize,
        include: { batch: { select: { batchNo: true, name: true } } }
      })
    ]);
    return pageResult(rows.map((row) => this.mapCard(row)), query.page, query.pageSize, total);
  }

  async batchOptions() {
    return this.prisma.cardBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { batchId: true, batchNo: true, name: true }
    });
  }

  async packageOptions(search?: string) {
    const normalized = search?.trim();
    return this.prisma.contentPackage.findMany({
      where: normalized ? { packageName: { contains: normalized } } : undefined,
      orderBy: { packageName: 'asc' },
      take: 200,
      select: { packageId: true, packageName: true }
    });
  }

  async createBatch(dto: CreateCardBatchDto, actor: { userId?: string }) {
    if (dto.packageId) {
      const packageRow = await this.prisma.contentPackage.findUnique({ where: { packageId: dto.packageId } });
      if (!packageRow) throw new BadRequestException('兑换商品不存在');
    }
    const generated = Array.from({ length: dto.quantity }, () => {
      const secret = randomBytes(12).toString('base64url');
      return {
        cardId: newEntityId('card'),
        cardNo: `CARD-${randomBytes(6).toString('hex').toUpperCase()}`,
        cardSecretHash: hashSecret(secret),
        secretHint: secret.slice(-4),
        status: 'unused',
        validEndAt: optionalDate(dto.validEndAt),
        secret
      };
    });
    const row = await this.prisma.cardBatch.create({
      data: {
        batchId: newEntityId('batch'),
        batchNo: `BATCH-${newEntityId().replace('-', '').slice(-12).toUpperCase()}`,
        name: dto.name.trim(),
        packageId: dto.packageId?.trim(),
        quantity: dto.quantity,
        validStartAt: optionalDate(dto.validStartAt),
        validEndAt: optionalDate(dto.validEndAt),
        createdBy: actor.userId,
        cards: {
          create: generated.map(({ secret: _secret, ...card }) => card)
        }
      }
    });
    return {
      batch: this.mapBatch(row, { unused: dto.quantity }),
      generatedCards: generated.map(({ cardNo, secret }) => ({ cardNo, secret }))
    };
  }

  async activate(cardId: string) {
    return this.changeCardStatus(cardId, ['unused', 'frozen'], 'active');
  }

  async freeze(cardId: string) {
    return this.changeCardStatus(cardId, ['unused', 'active'], 'frozen');
  }

  async redeem(dto: RedeemCardDto) {
    if (dto.memberId) {
      const member = await this.prisma.member.findUnique({ where: { memberId: dto.memberId } });
      if (!member) throw new BadRequestException('兑换用户不存在');
    }
    if (dto.orderId) {
      const order = await this.prisma.orderHeader.findUnique({ where: { orderId: dto.orderId } });
      if (!order) throw new BadRequestException('兑换订单不存在');
    }
    const card = await this.prisma.redemptionCard.findUnique({ where: { cardNo: dto.cardNo.trim() } });
    if (!card) throw new NotFoundException('卡密不存在');
    if (!['unused', 'active'].includes(card.status)) throw new ConflictException('卡密当前不可兑换');
    if (card.validEndAt && card.validEndAt.getTime() < Date.now()) {
      await this.prisma.redemptionCard.update({ where: { cardId: card.cardId }, data: { status: 'expired' } });
      throw new ConflictException('卡密已过期');
    }
    const updated = await this.prisma.redemptionCard.updateMany({
      where: {
        cardId: card.cardId,
        cardSecretHash: hashSecret(dto.secret),
        status: { in: ['unused', 'active'] }
      },
      data: {
        status: 'redeemed',
        memberId: dto.memberId?.trim(),
        redeemedOrderId: dto.orderId?.trim(),
        redeemedAt: new Date()
      }
    });
    if (updated.count !== 1) throw new ConflictException('卡密校验失败或已被兑换');
    return { cardNo: card.cardNo, status: 'redeemed', redeemedAt: new Date().toISOString() };
  }

  private async changeCardStatus(cardId: string, from: string[], status: string) {
    const row = await this.prisma.redemptionCard.findUnique({ where: { cardId } });
    if (!row) throw new NotFoundException('卡密不存在');
    if (!from.includes(row.status)) throw new ConflictException(`卡密当前状态为 ${row.status}，不能变更`);
    const updated = await this.prisma.redemptionCard.update({ where: { cardId }, data: { status } });
    return this.mapCard(updated);
  }

  private mapBatch(
    row: {
      batchId: string;
      batchNo: string;
      name: string;
      packageId: string | null;
      quantity: number;
      validStartAt: Date | null;
      validEndAt: Date | null;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    },
    counts: Record<string, number>
  ) {
    return {
      batchId: row.batchId,
      batchNo: row.batchNo,
      name: row.name,
      packageId: row.packageId,
      quantity: row.quantity,
      status: row.status,
      validStartAt: nullableDate(row.validStartAt),
      validEndAt: nullableDate(row.validEndAt),
      counts,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  }

  private mapCard(row: {
    cardId: string;
    batchId: string;
    cardNo: string;
    secretHint: string;
    status: string;
    memberId: string | null;
    redeemedOrderId: string | null;
    redeemedAt: Date | null;
    validEndAt: Date | null;
    createdAt: Date;
    batch?: { batchNo: string; name: string } | null;
  }) {
    return {
      cardId: row.cardId,
      batchId: row.batchId,
      batchNo: row.batch?.batchNo ?? null,
      batchName: row.batch?.name ?? null,
      cardNo: row.cardNo,
      secretHint: row.secretHint,
      status: row.status,
      memberId: row.memberId,
      redeemedOrderId: row.redeemedOrderId,
      redeemedAt: nullableDate(row.redeemedAt),
      validEndAt: nullableDate(row.validEndAt),
      createdAt: row.createdAt.toISOString()
    };
  }
}
