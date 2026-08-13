import { Inject, Injectable, Optional } from '@nestjs/common';
import { loadMemberBehaviorFacts } from '../common/member-behavior-facts';
import { PrismaService } from '../prisma/prisma.service';
import { sqlDatetime, toSqliteDateTime } from '../common/sqlite-datetime';
import { JeeSiteMemberClient } from './jeesite-member.client';
import { maskMemberPhone } from './user-center.service';
import {
  classifyUserLifecycle,
  USER_LIFECYCLE_STAGE_META,
  USER_LIFECYCLE_STAGES,
  type UserLifecycleStageKey
} from './user-lifecycle';
import type { UserLifecycleQueryDto } from './user-lifecycle.dto';
import type { UserLifecyclePayload } from './user-lifecycle.types';

type RawLifecycleSummary = {
  paidMembers: number | bigint | string;
  activeMembers30d: number | bigint | string;
  totalPaidGmvFen: number | bigint | string | null;
};

function fenToString(value: number | bigint | string | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

@Injectable()
export class UserLifecycleService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(JeeSiteMemberClient) private readonly jeeSiteMemberClient?: JeeSiteMemberClient
  ) {}

  async getOverview(query: UserLifecycleQueryDto): Promise<UserLifecyclePayload> {
    const now = new Date();
    const [facts, globalSummaryRows, memberDirectoryTotal] = await Promise.all([
      loadMemberBehaviorFacts(this.prisma, now),
      this.prisma.$queryRawUnsafe<RawLifecycleSummary[]>(
        `SELECT
           COUNT(DISTINCT CASE
             WHEN "paidTime" IS NOT NULL AND "memberId" IS NOT NULL THEN "memberId"
           END) AS "paidMembers",
           COUNT(DISTINCT CASE
             WHEN ${sqlDatetime('"paidTime"')} >= datetime(?) AND "memberId" IS NOT NULL THEN "memberId"
           END) AS "activeMembers30d",
           SUM(CASE
             WHEN "paidTime" IS NOT NULL THEN COALESCE("paidAmountFen", 0)
             ELSE 0
           END) AS "totalPaidGmvFen"
         FROM "OrderHeader"`,
        toSqliteDateTime(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))
      ),
      this.loadMemberDirectoryTotal()
    ]);
    const stagedFacts = facts.map((fact) => ({
      fact,
      stage: classifyUserLifecycle(fact, now)
    }));
    const stageCounts = new Map<UserLifecycleStageKey, number>(
      USER_LIFECYCLE_STAGES.map((stage) => [stage, 0])
    );
    for (const row of stagedFacts) stageCounts.set(row.stage, (stageCounts.get(row.stage) ?? 0) + 1);

    const totalPaidGmvFen = facts.reduce<bigint | null>((sum, fact) => {
      if (fact.paidGmvFen === null) return sum;
      return (sum ?? 0n) + fact.paidGmvFen;
    }, null);
    const total = facts.length;
    const globalSummary = globalSummaryRows[0] ?? {
      paidMembers: 0,
      activeMembers30d: 0,
      totalPaidGmvFen: null
    };
    const stages = USER_LIFECYCLE_STAGES.map((key) => ({
      key,
      label: USER_LIFECYCLE_STAGE_META[key].label,
      description: USER_LIFECYCLE_STAGE_META[key].description,
      memberCount: stageCounts.get(key) ?? 0,
      percentage: total ? Number((((stageCounts.get(key) ?? 0) / total) * 100).toFixed(1)) : 0
    }));
    const filtered = query.stage
      ? stagedFacts.filter((row) => row.stage === query.stage)
      : stagedFacts;
    filtered.sort(
      (left, right) =>
        (right.fact.lastPaidAt?.getTime() ?? Number.NEGATIVE_INFINITY) -
        (left.fact.lastPaidAt?.getTime() ?? Number.NEGATIVE_INFINITY)
    );
    const page = Math.max(1, Math.min(100, query.page));
    const pageSize = Math.max(1, Math.min(100, query.pageSize));
    const skip = (page - 1) * pageSize;

    return {
      asOf: now.toISOString(),
      summary: {
        totalMembers: memberDirectoryTotal ?? total,
        paidMembers: Number(globalSummary.paidMembers),
        activeMembers30d: Number(globalSummary.activeMembers30d),
        atRiskMembers: stageCounts.get('at_risk') ?? 0,
        churnedMembers: stageCounts.get('churned') ?? 0,
        totalPaidGmvFen: fenToString(globalSummary.totalPaidGmvFen) ?? totalPaidGmvFen?.toString() ?? null
      },
      stages,
      items: filtered.slice(skip, skip + pageSize).map(({ fact, stage }) => ({
        memberId: fact.memberId,
        nickname: fact.nickname,
        phone: maskMemberPhone(fact.phone),
        level: fact.level,
        stage,
        stageLabel: USER_LIFECYCLE_STAGE_META[stage].label,
        paidOrderCount: fact.paidOrderCount,
        paidGmvFen: fact.paidGmvFen?.toString() ?? null,
        firstPaidAt: fact.firstPaidAt?.toISOString() ?? null,
        lastPaidAt: fact.lastPaidAt?.toISOString() ?? null,
        daysSinceLastPaid: fact.daysSinceLastPaid
      })),
      pagination: {
        page,
        pageSize,
        total: filtered.length,
        hasMore: skip + pageSize < filtered.length
      },
      dataSources: memberDirectoryTotal === null
        ? ['Member', 'OrderHeader.paidTime']
        : ['JeeSite Member', 'Member', 'OrderHeader.paidTime']
    };
  }

  private async loadMemberDirectoryTotal(): Promise<number | null> {
    if (!this.jeeSiteMemberClient || !process.env.EXTERNAL_API_BASE_URL) return null;
    const page = await this.jeeSiteMemberClient.listMembers({ page: 1, pageSize: 1 });
    return page.count;
  }
}
