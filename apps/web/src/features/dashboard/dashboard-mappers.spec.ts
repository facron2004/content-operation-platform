import { describe, expect, it } from 'vitest';
import type { DashboardDataSources } from './dashboard-mappers';
import { mapDashboardSources } from './dashboard-mappers';

describe('dashboard real-data mappers', () => {
  it('keeps the empty state empty when real sources have no records', () => {
    const data = mapDashboardSources({
      workbench: null,
      console: null,
      trend: [],
      distributions: {},
      merchants: [],
      funnel: null,
      lifecycle: null,
      communities: null
    });

    expect(data.kpis).toEqual([]);
    expect(data.trendByRange['30d']).toEqual([]);
    expect(data.packages.hot).toEqual([]);
    expect(data.alerts).toEqual([]);
    expect(data.community.groups).toEqual([]);
  });

  it('maps live money, operations cards, lifecycle, community, and alerts without demo values', () => {
    const sources = {
      workbench: {
        date: '2026-08-17',
        updatedAt: '2026-08-17T10:00:00.000Z',
        dataSources: ['OrderHeader'],
        kpis: {
          gmv: {
            date: '2026-08-17',
            totalGmvFen: '12345',
            totalRefundFen: '123',
            paidOrderCount: 8,
            verifyOrderCount: 4,
            refundOrderCount: 1,
            refundRate: 0.125,
            verifyRate: 0.5,
            avgOrderValue: 15.27,
            dataSource: 'OrderHeader',
            compare: { totalGmv: 0.1 }
          },
          catalog: {
            totalMerchants: 1,
            totalSkus: 1,
            zeroSalesMerchants: 0,
            zeroSalesSkuCount: 0,
            zeroSalesSkuRatio: 0,
            dataSource: 'ContentPackage'
          }
        },
        trend: [
          {
            date: '2026-08-16',
            totalGmvFen: '10000',
            totalRefundFen: '100',
            paidOrderCount: 7,
            verifyCount: 3,
            refundRate: 0.14,
            verifyRate: 0.43
          },
          {
            date: '2026-08-17',
            totalGmvFen: '12345',
            totalRefundFen: '123',
            paidOrderCount: 8,
            verifyCount: 4,
            refundRate: 0.125,
            verifyRate: 0.5
          }
        ],
        pending: { total: 0, items: [], sources: [] }
      },
      console: {
        date: '2026-08-17',
        summary: {
          sellingCount: 1,
          mustPushCount: 1,
          riskCount: 1,
          hotOpportunityCount: 1,
          slowMovingCount: 1,
          communityTaskCount: 1,
          avgScore: 81,
          dangerAlertCount: 1,
          warningAlertCount: 0,
          activeAlertCount: 1,
          resolvedAlertCount: 0,
          updatedAt: '2026-08-17T10:00:00.000Z',
          dataSource: 'JeeSite',
          sellingOnly: true
        },
        hotOpportunities: [
          {
            packageId: 'pkg-live',
            packageName: '真实套餐',
            merchantName: '真实商家',
            areaName: '真实区域',
            category: '餐饮',
            stockLeft: 6,
            currentPrice: 39,
            score: 81,
            level: 'A',
            tags: [{ key: 'price_advantage', label: '价格优势', level: 'success', reason: '真实原因' }],
            reason: '真实原因',
            nextAction: '真实动作',
            recommendedChannels: []
          }
        ],
        mustPushPackages: [],
        riskPackages: [],
        slowMovingPackages: [],
        communityTasks: [
          {
            taskId: 'task-live',
            groupName: '真实社群',
            channel: 'wechat_group',
            plannedTime: '17:40',
            reason: '真实任务原因',
            packageId: 'pkg-live',
            packageName: '真实套餐'
          }
        ],
        yesterdayReview: {
          date: '2026-08-16',
          whatHappened: [],
          tomorrowSuggestions: [],
          highConversionCopies: []
        },
        alerts: [
          {
            alertId: 'alert-live',
            packageId: 'pkg-live',
            packageName: '真实套餐',
            merchantName: '真实商家',
            areaName: '真实区域',
            type: 'high_refund',
            level: 'danger',
            title: '真实预警',
            reason: '真实预警原因',
            action: '查看真实详情',
            createdAt: '2026-08-17T10:00:00.000Z'
          }
        ]
      },
      trend: [],
      distributions: {
        region: [{ key: '真实区域', totalGmvFen: '12345', share: 1 }]
      },
      merchants: [
        {
          merchantId: 'merchant-live',
          merchantName: '真实商家',
          areaName: '真实区域',
          gmvFen: '7890',
          refundRate: 0.01,
          verifyRate: 0.9,
          paidOrderCount: 3
        }
      ],
      funnel: {
        generatedCount: 0,
        approvedCount: 0,
        pushedCount: 0,
        pendingCount: 0,
        riskCount: 0,
        totalClickCount: 100,
        totalOrderCount: 10,
        totalVerifyCount: 8,
        totalGmv: 0,
        contentConversionRate: 0.1,
        verifyConversionRate: 0.8
      },
      lifecycle: {
        asOf: '2026-08-17',
        summary: {
          totalMembers: 20,
          paidMembers: 8,
          activeMembers30d: 12,
          atRiskMembers: 3,
          churnedMembers: 2,
          totalPaidGmvFen: '10000'
        },
        stages: [
          { key: 'new', label: '新用户', description: '', memberCount: 4, percentage: 0.2 },
          { key: 'active', label: '活跃用户', description: '', memberCount: 12, percentage: 0.6 }
        ],
        items: [],
        pagination: { page: 1, pageSize: 1, total: 20, hasMore: true },
        dataSources: ['Member']
      },
      communities: {
        items: [
          {
            groupId: 'group-live',
            groupName: '真实社群',
            groupType: 'wechat_group',
            areaId: 'area-live',
            memberCount: 28,
            activityLevel: 'high',
            tags: [],
            isActive: true,
            createdAt: '2026-08-01T00:00:00.000Z',
            updatedAt: '2026-08-17T00:00:00.000Z'
          }
        ],
        total: 1,
        page: 1,
        pageSize: 100
      }
    } as unknown as DashboardDataSources;

    const data = mapDashboardSources(sources);

    expect(data.kpis.find((item) => item.key === 'gmv')?.value).toBe(123.45);
    expect(data.kpis.find((item) => item.key === 'verify')?.value).toBe(4);
    expect(data.trendByRange.today[0]).toMatchObject({ gmv: 123.45, yesterdayGmv: 100 });
    expect(data.breakdowns.region[0]).toMatchObject({ label: '真实区域', value: 123.45, share: 100 });
    expect(data.merchants[0]).toMatchObject({ name: '真实商家', gmv: 78.9, health: '优秀' });
    expect(data.packages.hot[0]).toMatchObject({ id: 'pkg-live', price: 39, stockLeft: 6 });
    expect(data.users.dormantUsers).toBe(5);
    expect(data.community.groups[0]).toMatchObject({ name: '真实社群', memberCount: 28 });
    expect(data.community.bestSendReason).toBe('真实任务原因');
    expect(data.alerts[0]).toMatchObject({ id: 'alert-live', packageId: 'pkg-live', title: '真实预警' });
  });
});
