import { describe, expect, it } from 'vitest';
import type { ContentPackage, RecommendPackageItem, SalesSnapshot } from '@content/shared';
import { buildPromotionScore } from '../src/domain/promotion-rules';
import { buildPackageAnalysisResult } from '../src/content/content-package-analysis';
import { buildPackageAnalysisResult as buildFromLegacyCore } from '../src/content/content-recommend-core';

describe('content package analysis projection', () => {
  it('projects recommendation state and preserves the legacy core export', () => {
    const pkg: ContentPackage = {
      packageId: 'PKG-ANALYSIS',
      packageName: '套餐分析',
      packageType: 'welfare',
      merchantId: 'MERCHANT-1',
      merchantName: '商家一',
      areaId: 'AREA-1',
      areaName: '区域一',
      category: '火锅',
      originalPrice: 100,
      salePrice: 50,
      commissionRate: 0,
      grossProfit: 50,
      stockTotal: 10,
      stockLeft: 8,
      startTime: '2026-07-01T00:00:00.000Z',
      endTime: '2026-08-01T00:00:00.000Z',
      useRules: ['提前预约'],
      sellingPoints: ['双人餐'],
      miniProgramPath: '/pages/package',
      merchantCooperationScore: 80,
      areaMatchScore: 80,
      timeMatchScore: 80,
      historyScore: 80,
      saleStatus: 'selling'
    };
    const snapshot: SalesSnapshot = {
      packageId: pkg.packageId,
      areaId: pkg.areaId,
      merchantId: pkg.merchantId,
      snapshotTime: '2026-07-17T04:00:00.000Z',
      exposureCount: 100,
      clickCount: 20,
      orderCount: 10,
      paidOrderCount: 8,
      refundCount: 1,
      verifyCount: 6,
      gmv: 400,
      paidAmount: 400,
      refundAmount: 50,
      conversionRate: 0.1,
      verifyRate: 0.75,
      refundRate: 0.125,
      sellThroughRate: 0.2,
      remainingStock: 8,
      salesSpeed: 1
    };
    const promotion = buildPromotionScore(pkg, snapshot, new Date('2026-07-17T04:00:00.000Z'));
    const recommendationItem = {
      ...pkg,
      status: promotion.status,
      promotionLevel: promotion.level,
      promotionScore: promotion.score,
      inventoryBacklogDays: 3,
      inventoryPriority: 'backlog_3d',
      inventoryFlag: 'unsold_3d_slow',
      inventoryFlagLabel: '连续 3 天未售罄',
      inventoryFlagLevel: 'danger',
      inventorySalesFlag: 'slow_never_sold_out',
      inventorySalesLabel: '持续未售罄',
      inventorySalesLevel: 'warning',
      inventoryObservedDays: 3,
      inventorySoldOutDays: 0,
      inventoryUnsoldDays: 3,
      inventoryTrend: [
        {
          date: '2026-07-17',
          snapshotTime: snapshot.snapshotTime,
          remainingStock: 8
        }
      ],
      recommendedStrategy: promotion.recommendedStrategy,
      reason: promotion.reason,
      riskTips: promotion.riskTips,
      recommendedChannels: promotion.recommendedChannels,
      conversionRate: snapshot.conversionRate,
      verifyRate: snapshot.verifyRate,
      refundRate: snapshot.refundRate
    } as RecommendPackageItem;

    const result = buildPackageAnalysisResult({
      pkg,
      snapshot,
      promotion,
      recommendationItem,
      scoreBreakdown: {
        totalScore: promotion.score,
        level: promotion.level,
        dimensions: [],
        reasons: []
      },
      operationTags: [],
      operationAlerts: []
    });

    expect(buildFromLegacyCore).toBe(buildPackageAnalysisResult);
    expect(result.package).toBe(pkg);
    expect(result.status).toBe(promotion.status);
    expect(result.inventoryTrend).toEqual(recommendationItem.inventoryTrend);
    expect(result.recommendation.suggestedChannels).toEqual(promotion.recommendedChannels);
    expect(result.trends).toEqual([
      { label: '曝光', value: 100 },
      { label: '点击', value: 20 },
      { label: '下单', value: 10 },
      { label: '支付', value: 8 },
      { label: '核销', value: 6 },
      { label: '退款', value: 1 }
    ]);
  });
});
