import { createDtoPipe } from '../common/dto-pipe';
import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { UserRole } from '@content/shared';
import { USER_ROLES, beijingDateKey } from '@content/shared';
import { ContentService } from './content.service';
import { DashboardService } from './dashboard.service';
import { OpsTodayQueryDto } from './content.dto';
import { resolveScopedQuery } from '../user-access/data-scope';
import { assertUnrestrictedAnalytics } from '../user-access/scope-guards';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';

type AuthUser = {
  userId: string;
  username: string;
  roles?: string[];
  bindings?: Array<{ role: string; scopeType?: string; scopeId?: string }>;
};

function scopedRecommend(
  contentService: ContentService,
  req: Request
): (
  q: Parameters<ContentService['getRecommendations']>[0]
) => ReturnType<ContentService['getRecommendations']> {
  const actor = req.user as AuthUser | undefined;
  const scoped = resolveScopedQuery(actor ?? {}, {});
  return (q) => {
    if (scoped.emptyScope) {
      return Promise.resolve({
        date: q.date ?? beijingDateKey(new Date()),
        areaId: 'none',
        packages: [],
        matchedCount: 0
      }) as ReturnType<ContentService['getRecommendations']>;
    }
    return contentService.getRecommendations({
      ...q,
      areaId: scoped.areaId ?? q.areaId,
      merchantId: scoped.merchantId ?? q.merchantId,
      areaIds: scoped.areaIds,
      merchantIds: scoped.merchantIds
    });
  };
}

function opsScopeFromReq(req: Request) {
  const actor = req.user as AuthUser | undefined;
  const scoped = resolveScopedQuery(actor ?? {}, {});
  return {
    areaId: scoped.areaId,
    merchantId: scoped.merchantId,
    areaIds: scoped.areaIds,
    merchantIds: scoped.merchantIds
  };
}

@ApiTags('dashboard')
@RequireLogin()
@Controller('api/content')
export class DashboardController {
  constructor(
    @Inject(DashboardService) private readonly dashboardService: DashboardService,
    // ContentService 用于包"获取推荐数据"回调,传给 DashboardService(避免 dashboard 依赖 content)
    @Inject(ContentService) private readonly contentService: ContentService
  ) {}

  @Get('dashboard/summary')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: '仪表盘摘要', description: '文稿数量、GMV、转化率、套餐状态分布' })
  async getDashboardSummary(@Req() req: Request) {
    const actor = req.user as AuthUser | undefined;
    const scoped = resolveScopedQuery(actor ?? {}, {});
    // Empty scope (bound role with no bindings) → zeroed payload, no full-table scan.
    if (scoped.emptyScope) {
      return {
        generatedCount: 0,
        approvedCount: 0,
        pushedCount: 0,
        pendingCount: 0,
        riskCount: 0,
        totalClickCount: 0,
        totalOrderCount: 0,
        totalVerifyCount: 0,
        totalGmv: 0,
        contentConversionRate: 0,
        verifyConversionRate: 0,
        statusDistribution: {},
        topPackages: [],
        riskPackages: []
      };
    }
    const hasScope =
      Boolean(scoped.areaId) ||
      Boolean(scoped.merchantId) ||
      Boolean(scoped.areaIds?.length) ||
      Boolean(scoped.merchantIds?.length);
    // Scoped operators only need package cards from recommendations — skip platform-wide
    // CopyPerformance/GeneratedCopy aggregates so they never touch cross-tenant counters.
    if (hasScope) {
      const summary = await this.dashboardService.getDashboardSummary(
        scopedRecommend(this.contentService, req),
        { includePlatformCounters: false }
      );
      return {
        ...summary,
        generatedCount: 0,
        approvedCount: 0,
        pushedCount: 0,
        pendingCount: 0,
        riskCount: 0,
        totalClickCount: 0,
        totalOrderCount: 0,
        totalVerifyCount: 0,
        totalGmv: 0,
        contentConversionRate: 0,
        verifyConversionRate: 0
      };
    }
    return this.dashboardService.getDashboardSummary(scopedRecommend(this.contentService, req), {
      includePlatformCounters: true
    });
  }

  @Get('ops/today')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: '今日运营作战台',
    description: '必推/风险/爆款/滞销/社群任务/昨日复盘一览'
  })
  getTodayOperationConsole(
    @Query(createDtoPipe(OpsTodayQueryDto)) query: OpsTodayQueryDto,
    @Req() req: Request
  ) {
    // Whitelist role — free-form strings thrash the opsCache key space (role is in key).
    const validRole =
      query.role && (USER_ROLES as readonly string[]).includes(query.role)
        ? (query.role as UserRole)
        : undefined;
    return this.dashboardService.getTodayOperationConsole(
      validRole,
      scopedRecommend(this.contentService, req),
      opsScopeFromReq(req)
    );
  }

  @Get('ops/review')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  async getOperationReview(
    @Query('date') date: string | undefined,
    @Query('role') role: string | undefined,
    @Req() req: Request
  ) {
    const validRole =
      role && (USER_ROLES as readonly string[]).includes(role) ? (role as UserRole) : undefined;
    // Ignore free-form date strings longer than ISO date; service uses yesterdayReview.date.
    const safeDate =
      typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
    const result = await this.dashboardService.getTodayOperationConsole(
      validRole,
      scopedRecommend(this.contentService, req),
      opsScopeFromReq(req)
    );
    return { ...result.yesterdayReview, date: safeDate ?? result.yesterdayReview.date };
  }

  @Get('performance')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  getPerformance(@Req() req: Request) {
    // CopyPerformance aggregates are platform-wide; package-scoped cards already
    // flow through scopedRecommend for ops/today. Keep this endpoint unrestricted-only.
    assertUnrestrictedAnalytics(req);
    return this.dashboardService.getPerformance(scopedRecommend(this.contentService, req));
  }
}
