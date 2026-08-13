import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UserCenterListQueryDto } from './user-center.dto';
import type {
  UserCenterMemberDetail,
  UserCenterMemberItem,
  UserCenterListPayload
} from './user-center.types';
import {
  JeeSiteMemberClient,
  type JeeSiteMemberListQuery,
  type JeeSiteMemberRow
} from './jeesite-member.client';
import { sqlDatetime, toSqliteDateTime } from '../common/sqlite-datetime';

const DETAIL_ORDER_LIMIT = 10;
const DETAIL_LEDGER_LIMIT = 10;
const LOCAL_MEMBER_SELECT = {
  memberId: true,
  inviteCode: true,
  parentInviteCode: true,
  nickname: true,
  phone: true,
  level: true,
  pointsBalance: true,
  walletBalanceFen: true,
  totalGmvFen: true,
  firstOrderAt: true,
  lastOrderAt: true,
  totalOrders: true,
  tags: true
} as const;

/** Compatibility projection for dev databases before 0023_member_invitation_hierarchy. */
const LEGACY_MEMBER_SELECT = {
  memberId: true,
  nickname: true,
  phone: true,
  level: true,
  pointsBalance: true,
  walletBalanceFen: true,
  totalGmvFen: true,
  firstOrderAt: true,
  lastOrderAt: true,
  totalOrders: true,
  tags: true
} as const;

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
  inviteCode?: string | null;
  parentInviteCode?: string | null;
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

type RawOrderTotals = {
  totalOrders: number | bigint | string;
  totalGmvFen: bigint | number | string | null;
};

type RawMemberSummary = {
  paidMembers: number | bigint | string;
  activeMembers30d: number | bigint | string;
};

type MemberDownlineGroup = {
  parentInviteCode: string | null;
  _count: { _all: number };
};

function parseSqliteDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fenBigIntOrNull(value: bigint | number | string | null | undefined): bigint | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'bigint'
    ? value
    : typeof value === 'string'
      ? BigInt(value)
      : BigInt(Math.trunc(value));
}

function isMissingInvitationColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such column[\s\S]*(?:inviteCode|parentInviteCode)|(?:inviteCode|parentInviteCode)[\s\S]*no such column/i.test(
    message
  );
}

function externalString(row: JeeSiteMemberRow, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function mapExternalMember(row: JeeSiteMemberRow): MemberRow | null {
  const memberId = externalString(row, 'id', 'memberId');
  if (!memberId) return null;
  return {
    memberId,
    inviteCode: externalString(row, 'code', 'inviteCode', 'invitationCode', 'memberInviteCode'),
    parentInviteCode: externalString(
      row,
      'parentCode',
      'parentInviteCode',
      'parentInvitationCode',
      'superiorInviteCode'
    ),
    nickname: externalString(row, 'nickName', 'nickname'),
    phone: externalString(row, 'phone', 'mobile'),
    level: externalString(row, 'level'),
    pointsBalance: 0,
    walletBalanceFen: null,
    totalGmvFen: null,
    firstOrderAt: null,
    lastOrderAt: null,
    totalOrders: 0,
    tags: null
  };
}

function mergeMemberProfile(local: MemberRow | undefined, external: MemberRow): MemberRow {
  return {
    ...external,
    ...(local ?? {}),
    inviteCode: external.inviteCode ?? local?.inviteCode ?? null,
    parentInviteCode: external.parentInviteCode ?? local?.parentInviteCode ?? null,
    nickname: external.nickname ?? local?.nickname ?? null,
    phone: external.phone ?? local?.phone ?? null,
    level: external.level ?? local?.level ?? null
  };
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
  },
  tagText?: string | null,
  downlineCount = 0
): UserCenterMemberItem {
  return {
    memberId: member.memberId,
    inviteCode: member.inviteCode ?? null,
    parentInviteCode: member.parentInviteCode ?? null,
    downlineCount,
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
    tags: tagText ?? member.tags
  };
}

@Injectable()
export class UserCenterService {
  private static readonly DOWNLINE_CACHE_TTL_MS = 5 * 60 * 1000;
  private downlineCountCache: { map: Map<string, number>; expiresAt: number } | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(JeeSiteMemberClient) private readonly jeeSiteMemberClient?: JeeSiteMemberClient
  ) {}

  async listMembers(query: UserCenterListQueryDto): Promise<UserCenterListPayload> {
    try {
      if (this.jeeSiteMemberClient && process.env.EXTERNAL_API_BASE_URL) {
        return await this.listExternalMembers(query, true);
      }
      return await this.listLocalMembers(query, true);
    } catch (error) {
      // The running dev DB can lag one migration behind while the API is open.
      // Keep the list usable until the migration can be applied during maintenance.
      if (!isMissingInvitationColumnError(error)) throw error;
      if (this.jeeSiteMemberClient && process.env.EXTERNAL_API_BASE_URL) {
        return this.listExternalMembers(query, false);
      }
      return this.listLocalMembers(query, false);
    }
  }

  private async listLocalMembers(
    query: UserCenterListQueryDto,
    includeInvitationHierarchy: boolean
  ): Promise<UserCenterListPayload> {
    const search = query.search?.trim();
    const searchFields = [
      { memberId: { contains: search } },
      { nickname: { contains: search } },
      { phone: { contains: search } },
      ...(includeInvitationHierarchy
        ? [{ inviteCode: { contains: search } }, { parentInviteCode: { contains: search } }]
        : [])
    ];
    const where = {
      ...(query.level?.trim() ? { level: query.level.trim() } : {}),
      ...(search
        ? {
            OR: searchFields
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
      ? await this.prisma.member.findMany({
          where: { memberId: { in: pageMemberIds } },
          select: includeInvitationHierarchy ? LOCAL_MEMBER_SELECT : LEGACY_MEMBER_SELECT
        })
      : [];
    const tagRelations = pageMemberIds.length && this.prisma.userTagRelation
      ? await this.prisma.userTagRelation.findMany({
          where: { memberId: { in: pageMemberIds }, tag: { status: 'active' } },
          select: { memberId: true, tag: { select: { name: true } } }
        })
      : [];
    const tagsByMember = new Map<string, string[]>();
    for (const relation of tagRelations) {
      const tags = tagsByMember.get(relation.memberId) ?? [];
      tags.push(relation.tag.name);
      tagsByMember.set(relation.memberId, tags);
    }
    const memberById = new Map(pageMembers.map((member) => [member.memberId, member]));
    const orderedMembers = pageMemberIds
      .map((memberId) => memberById.get(memberId))
      .filter((member): member is (typeof pageMembers)[number] => Boolean(member));
    const downlineCountByInviteCode = await this.loadDownlineCounts(
      orderedMembers,
      includeInvitationHierarchy
    );

    return {
      items: orderedMembers.map((member) => {
        const paid = paidByMember.get(member.memberId);
        const inviteCode =
          'inviteCode' in member && typeof member.inviteCode === 'string' ? member.inviteCode : null;
        return mapMember(
          member,
          paid?.count ?? 0,
          paid?.gmvFen ?? null,
          orderByMember.get(member.memberId) ?? {
            totalOrders: 0,
            totalGmvFen: null,
            firstOrderAt: null,
            lastOrderAt: null
          },
          tagsByMember.get(member.memberId)?.join(','),
          inviteCode ? downlineCountByInviteCode.get(inviteCode) ?? 0 : 0
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

  private async listExternalMembers(
    query: UserCenterListQueryDto,
    includeInvitationHierarchy: boolean
  ): Promise<UserCenterListPayload> {
    const externalPage = await this.jeeSiteMemberClient!.listMembers({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      level: query.level
    });
    const externalMembers = externalPage.list
      .map(mapExternalMember)
      .filter((member): member is MemberRow => Boolean(member));
    const memberIds = externalMembers.map((member) => member.memberId);
    const activeSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [
      localMembers,
      orderAggregates,
      paidOrders,
      orderTotals,
      memberSummaryRows
    ] =
      await Promise.all([
        memberIds.length
          ? this.prisma.member.findMany({
              where: { memberId: { in: memberIds } },
              select: includeInvitationHierarchy ? LOCAL_MEMBER_SELECT : LEGACY_MEMBER_SELECT
            })
          : [],
        memberIds.length
          ? this.prisma.$queryRawUnsafe<RawMemberOrderAggregate[]>(
              `SELECT
                 "memberId" AS "memberId",
                 COUNT(*) AS "totalOrders",
                 SUM(CASE WHEN "paidTime" IS NOT NULL THEN COALESCE("paidAmountFen", 0) ELSE 0 END) AS "totalGmvFen",
                 MIN(${sqlDatetime('"orderTime"')}) AS "firstOrderAt",
                 MAX(${sqlDatetime('"orderTime"')}) AS "lastOrderAt"
               FROM "OrderHeader"
               WHERE "memberId" IN (${memberIds.map(() => '?').join(',')})
               GROUP BY "memberId"`,
              ...memberIds
            )
          : [],
        memberIds.length
          ? this.prisma.orderHeader.groupBy({
              by: ['memberId'],
              where: { memberId: { in: memberIds }, paidTime: { not: null } },
              _count: { _all: true },
              _sum: { paidAmountFen: true }
            })
          : [],
        this.prisma.$queryRawUnsafe<RawOrderTotals[]>(
          `SELECT
             COUNT(*) AS "totalOrders",
             SUM(CASE WHEN "paidTime" IS NOT NULL THEN COALESCE("paidAmountFen", 0) ELSE 0 END) AS "totalGmvFen"
           FROM "OrderHeader"`
        ),
        this.prisma.$queryRawUnsafe<RawMemberSummary[]>(
          `SELECT
             COUNT(DISTINCT CASE
               WHEN "paidTime" IS NOT NULL AND "memberId" IS NOT NULL THEN "memberId"
             END) AS "paidMembers",
             COUNT(DISTINCT CASE
               WHEN ${sqlDatetime('"paidTime"')} >= datetime(?) AND "memberId" IS NOT NULL THEN "memberId"
             END) AS "activeMembers30d"
           FROM "OrderHeader"`,
          toSqliteDateTime(activeSince)
        )
      ]);
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
    const tagsByMember = await this.loadTagsByMember(memberIds);
    const localById = new Map(localMembers.map((member) => [member.memberId, member]));
    const totals = orderTotals[0] ?? { totalOrders: 0, totalGmvFen: null };
    const memberSummary = memberSummaryRows[0] ?? { paidMembers: 0, activeMembers30d: 0 };
    const downlineCountByInviteCode = await this.loadDownlineCounts(
      externalMembers,
      includeInvitationHierarchy
    );

    return {
      items: externalMembers.map((externalMember) => {
        const member = mergeMemberProfile(localById.get(externalMember.memberId), externalMember);
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
          },
          tagsByMember.get(member.memberId)?.join(','),
          member.inviteCode ? downlineCountByInviteCode.get(member.inviteCode) ?? 0 : 0
        );
      }),
      pagination: {
        page: externalPage.pageNo,
        pageSize: externalPage.pageSize,
        total: externalPage.count,
        hasMore: externalPage.pageNo * externalPage.pageSize < externalPage.count
      },
      summary: {
        totalMembers: externalPage.count,
        paidMembers: Number(memberSummary.paidMembers),
        activeMembers30d: Number(memberSummary.activeMembers30d),
        totalOrders: Number(totals.totalOrders),
        totalGmvFen: fenToString(fenBigIntOrNull(totals.totalGmvFen))
      },
      dataSources: ['JeeSite Member', 'OrderHeader']
    };
  }

  private async loadTagsByMember(memberIds: string[]): Promise<Map<string, string[]>> {
    const tagsByMember = new Map<string, string[]>();
    if (!memberIds.length || !this.prisma.userTagRelation) return tagsByMember;
    const tagRelations = await this.prisma.userTagRelation.findMany({
      where: { memberId: { in: memberIds }, tag: { status: 'active' } },
      select: { memberId: true, tag: { select: { name: true } } }
    });
    for (const relation of tagRelations) {
      const tags = tagsByMember.get(relation.memberId) ?? [];
      tags.push(relation.tag.name);
      tagsByMember.set(relation.memberId, tags);
    }
    return tagsByMember;
  }

  private async loadDownlineCounts(
    members: MemberRow[],
    includeInvitationHierarchy: boolean
  ): Promise<Map<string, number>> {
    if (!includeInvitationHierarchy) return new Map();
    const inviteCodes = members
      .map((member) => member.inviteCode)
      .filter((inviteCode): inviteCode is string => Boolean(inviteCode));
    if (!inviteCodes.length) return new Map();
    // 外部数据源：直接从 JeeSite 会员接口统计 parentInviteCode 分布，不依赖本地空表
    if (this.jeeSiteMemberClient && process.env.EXTERNAL_API_BASE_URL) {
      try {
        const downlineMap = await this.loadDownlineCountMapFromExternal();
        return new Map(inviteCodes.map((code) => [code, downlineMap.get(code) ?? 0]));
      } catch {
        // 外部统计失败时回退到本地表，保证列表可用
      }
    }
    const groups = await this.prisma.member.groupBy({
      by: ['parentInviteCode'],
      where: { parentInviteCode: { in: inviteCodes } },
      _count: { _all: true }
    });
    return new Map(
      groups
        .filter((group): group is MemberDownlineGroup & { parentInviteCode: string } => Boolean(group.parentInviteCode))
        .map((group) => [group.parentInviteCode, group._count._all])
    );
  }

  /**
   * 拉取 JeeSite 全量会员的 parentInviteCode 分布，构建 inviteCode → 下级数 映射。
   * 首页拿 total 后并发拉取剩余分页，结果缓存 5 分钟避免重复请求。
   */
  private async loadDownlineCountMapFromExternal(): Promise<Map<string, number>> {
    if (this.downlineCountCache && Date.now() < this.downlineCountCache.expiresAt) {
      return this.downlineCountCache.map;
    }
    const counts = new Map<string, number>();
    const pageSize = 500;
    const firstPage = await this.jeeSiteMemberClient!.listMembers({ page: 1, pageSize });
    const total = firstPage.count;
    this.collectParentInviteCodes(firstPage.list, counts);
    const totalPages = Math.ceil(total / pageSize);
    if (totalPages > 1) {
      const remaining = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
      // 限制并发为 3，避免大量并发请求触发 JeeSite 连接拒绝
      const concurrency = 3;
      for (let i = 0; i < remaining.length; i += concurrency) {
        const batch = remaining.slice(i, i + concurrency);
        const pages = await Promise.all(
          batch.map((pageNo) =>
            this.jeeSiteMemberClient!.listMembers({ page: pageNo, pageSize })
          )
        );
        for (const page of pages) {
          this.collectParentInviteCodes(page.list, counts);
        }
      }
    }
    this.downlineCountCache = {
      map: counts,
      expiresAt: Date.now() + UserCenterService.DOWNLINE_CACHE_TTL_MS
    };
    return counts;
  }

  private collectParentInviteCodes(
    rows: JeeSiteMemberRow[],
    counts: Map<string, number>
  ): void {
    for (const row of rows) {
      const parentCode = externalString(
        row,
        'parentCode',
        'parentInviteCode',
        'parentInvitationCode',
        'superiorInviteCode'
      );
      if (parentCode) {
        counts.set(parentCode, (counts.get(parentCode) ?? 0) + 1);
      }
    }
  }

  async getMember(memberId: string, inviteCode?: string): Promise<UserCenterMemberDetail> {
    try {
      return await this.loadMember(memberId, inviteCode, true);
    } catch (error) {
      if (!isMissingInvitationColumnError(error)) throw error;
      return this.loadMember(memberId, inviteCode, false);
    }
  }

  private async loadMember(
    memberId: string,
    inviteCode: string | undefined,
    includeInvitationHierarchy: boolean
  ): Promise<UserCenterMemberDetail> {
    const localMember = await this.prisma.member.findUnique({
      where: { memberId },
      select: includeInvitationHierarchy ? LOCAL_MEMBER_SELECT : LEGACY_MEMBER_SELECT
    });
    let member: MemberRow;
    let externalProfile = false;
    if (localMember) {
      member = localMember;
    } else if (this.jeeSiteMemberClient && process.env.EXTERNAL_API_BASE_URL) {
      const externalQueries: JeeSiteMemberListQuery[] = [];
      if (inviteCode?.trim()) {
        externalQueries.push({ page: 1, pageSize: 1, inviteCode: inviteCode.trim() });
      }
      externalQueries.push({ page: 1, pageSize: 1, search: memberId });
      let externalMember: MemberRow | undefined;
      for (const externalQuery of externalQueries) {
        const externalPage = await this.jeeSiteMemberClient.listMembers(externalQuery);
        externalMember = externalPage.list
          .map(mapExternalMember)
          .find((candidate): candidate is MemberRow => candidate?.memberId === memberId);
        if (externalMember) break;
      }
      if (!externalMember) throw new NotFoundException('用户不存在');
      member = externalMember;
      externalProfile = true;
    } else {
      throw new NotFoundException('用户不存在');
    }

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
    const tagRelations = this.prisma.userTagRelation
      ? await this.prisma.userTagRelation.findMany({
          where: { memberId, tag: { status: 'active' } },
          select: { tag: { select: { name: true } } }
        })
      : [];
    const tagText = tagRelations.map((relation) => relation.tag.name).join(',') || member.tags;
    let downlineCount = 0;
    if (includeInvitationHierarchy && member.inviteCode) {
      if (this.jeeSiteMemberClient && process.env.EXTERNAL_API_BASE_URL) {
        try {
          const downlineMap = await this.loadDownlineCountMapFromExternal();
          downlineCount = downlineMap.get(member.inviteCode) ?? 0;
        } catch {
          downlineCount = await this.prisma.member.count({
            where: { parentInviteCode: member.inviteCode }
          });
        }
      } else {
        downlineCount = await this.prisma.member.count({
          where: { parentInviteCode: member.inviteCode }
        });
      }
    }
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
      }, tagText, downlineCount),
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
      dataSources: externalProfile
        ? ['JeeSite Member', 'OrderHeader', 'MemberPointLedger']
        : ['Member', 'OrderHeader', 'MemberPointLedger']
    };
  }
}
