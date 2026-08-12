import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { GapListQueryDto } from './gap-center.dto';
import { clampScore, pageResult } from './gap-center.utils';
import { PrismaService } from '../prisma/prisma.service';

type DimensionScores = {
  overallScore: number;
  tradeScore: number;
  fulfillmentScore: number;
  refundScore: number;
  productScore: number;
  campaignScore: number;
  riskScore: number;
};

@Injectable()
export class MerchantScoreService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query: GapListQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.MerchantWhereInput = search
      ? {
          OR: [
            { merchantId: { contains: search } },
            { merchantName: { contains: search } },
            { areaName: { contains: search } }
          ]
        }
      : {};
    const [merchants, total] = await Promise.all([
      this.prisma.merchant.findMany({
        where,
        orderBy: { merchantName: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: { merchantId: true, merchantName: true, areaId: true, areaName: true }
      }),
      this.prisma.merchant.count({ where })
    ]);
    const items = await this.buildItems(merchants);
    items.sort((left, right) => (right.score?.overallScore ?? -1) - (left.score?.overallScore ?? -1));
    return pageResult(items, query.page, query.pageSize, total);
  }

  async recalculate(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { merchantId },
      select: { merchantId: true, merchantName: true, areaId: true, areaName: true }
    });
    if (!merchant) throw new NotFoundException('商家不存在');
    const item = (await this.buildItems([merchant]))[0];
    if (!item.score) return item;
    const {
      overallScore,
      tradeScore,
      fulfillmentScore,
      refundScore,
      productScore,
      campaignScore,
      riskScore
    } = item.score;
    const row = await this.prisma.merchantScore.create({
      data: {
        merchantId,
        overallScore,
        tradeScore,
        fulfillmentScore,
        refundScore,
        productScore,
        campaignScore,
        riskScore,
        source: 'manual_recalculate'
      }
    });
    return {
      ...item,
      score: { ...item.score, scoreId: row.scoreId, source: row.source, calculatedAt: row.calculatedAt.toISOString() }
    };
  }

  private async buildItems(
    merchants: Array<{ merchantId: string; merchantName: string; areaId: string | null; areaName: string | null }>
  ) {
    if (!merchants.length) return [];
    const merchantIds = merchants.map((merchant) => merchant.merchantId);
    const [paidOrders, verifiedOrders, refundedOrders, packages, savedScores] = await Promise.all([
      this.prisma.orderHeader.groupBy({
        by: ['merchantId'],
        where: { merchantId: { in: merchantIds }, paidTime: { not: null } },
        _count: { _all: true }
      }),
      this.prisma.orderHeader.groupBy({
        by: ['merchantId'],
        where: { merchantId: { in: merchantIds }, status: { in: ['verified', 'completed'] } },
        _count: { _all: true }
      }),
      this.prisma.orderHeader.groupBy({
        by: ['merchantId'],
        where: { merchantId: { in: merchantIds }, refundTime: { not: null } },
        _count: { _all: true }
      }),
      this.prisma.contentPackage.groupBy({
        by: ['merchantId'],
        where: { merchantId: { in: merchantIds } },
        _count: { _all: true },
        _avg: { merchantCooperationScore: true }
      }),
      this.prisma.merchantScore.findMany({
        where: { merchantId: { in: merchantIds } },
        orderBy: { calculatedAt: 'desc' }
      })
    ]);
    const countMap = <T extends { merchantId: string | null }>(rows: T[]) =>
      new Map(rows.filter((row) => row.merchantId).map((row) => [row.merchantId as string, row]));
    const paidMap = countMap(paidOrders);
    const verifiedMap = countMap(verifiedOrders);
    const refundedMap = countMap(refundedOrders);
    const packageMap = countMap(packages);
    const scoreMap = new Map<string, (typeof savedScores)[number]>();
    for (const score of savedScores) if (!scoreMap.has(score.merchantId)) scoreMap.set(score.merchantId, score);

    return merchants.map((merchant) => {
      const paid = paidMap.get(merchant.merchantId)?._count._all ?? 0;
      const verified = verifiedMap.get(merchant.merchantId)?._count._all ?? 0;
      const refunded = refundedMap.get(merchant.merchantId)?._count._all ?? 0;
      const packageStats = packageMap.get(merchant.merchantId);
      const packageCount = packageStats?._count._all ?? 0;
      const saved = scoreMap.get(merchant.merchantId);
      const score = saved
        ? {
            scoreId: saved.scoreId,
            overallScore: saved.overallScore,
            tradeScore: saved.tradeScore,
            fulfillmentScore: saved.fulfillmentScore,
            refundScore: saved.refundScore,
            productScore: saved.productScore,
            campaignScore: saved.campaignScore,
            riskScore: saved.riskScore,
            source: saved.source,
            calculatedAt: saved.calculatedAt.toISOString()
          }
        : this.calculateScores({ paid, verified, refunded, packageCount, packageAverage: packageStats?._avg.merchantCooperationScore ?? null });
      return {
        merchantId: merchant.merchantId,
        merchantName: merchant.merchantName,
        areaId: merchant.areaId,
        areaName: merchant.areaName,
        orderCount: paid,
        verifiedCount: verified,
        refundCount: refunded,
        packageCount,
        score
      };
    });
  }

  private calculateScores(input: {
    paid: number;
    verified: number;
    refunded: number;
    packageCount: number;
    packageAverage: number | null;
  }): (DimensionScores & { source: string; calculatedAt: null }) | null {
    if (!input.paid && !input.packageCount) return null;
    const tradeScore = input.paid ? clampScore(60 + Math.min(40, input.paid / 100)) : 50;
    const fulfillmentScore = input.paid ? clampScore((input.verified / input.paid) * 100) : 50;
    const refundRate = input.paid ? input.refunded / input.paid : 0;
    const refundScore = clampScore(100 - refundRate * 200);
    const productScore = input.packageCount ? clampScore(50 + Math.min(50, input.packageCount * 5)) : 50;
    const campaignScore = input.packageAverage == null ? 50 : clampScore(input.packageAverage);
    const riskScore = clampScore(100 - refundRate * 300);
    const overallScore = clampScore(
      tradeScore * 0.2 +
        fulfillmentScore * 0.2 +
        refundScore * 0.2 +
        productScore * 0.15 +
        campaignScore * 0.15 +
        riskScore * 0.1
    );
    return {
      overallScore,
      tradeScore,
      fulfillmentScore,
      refundScore,
      productScore,
      campaignScore,
      riskScore,
      source: 'live_calculation',
      calculatedAt: null
    };
  }
}
