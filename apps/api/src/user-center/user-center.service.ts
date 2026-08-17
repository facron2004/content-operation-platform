import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException
} from '@nestjs/common';
import { parseYuanStringToFen } from '@content/shared';
import { PrismaService } from '../prisma/prisma.service';
import { JobRunnerService } from '../jobs/job-runner.service';
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
import {
  getLatestSuccessfulMemberDirectorySnapshot,
  isMissingMemberDirectoryTableError,
  type MemberDirectorySnapshot
} from './member-directory-snapshot';
import { parseJeeSiteDate, toJeeSiteSqliteDate } from './member-directory-time';
import {
  getActivePersistedOrInMemoryUserCenterRefreshJob,
  getPersistedUserCenterRefreshJob,
  getUserCenterRefreshJob,
  startUserCenterRefreshJob,
  type UserCenterRefreshJob
} from './user-center-refresh-job';
import {
  countNewMembersByCreatedAt,
  getNewMemberWindows,
  unavailableNewMemberSummary,
  type NewMemberSummary
} from './user-center-new-members';

const DETAIL_ORDER_LIMIT = 10;
const DETAIL_LEDGER_LIMIT = 10;
const DIRECTORY_WRITE_BATCH_SIZE = 50;
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
  sourceStatus?: string | null;
  sourceIdentity?: number | null;
  sourceCreatedAt?: Date | null;
  sourceUpdatedAt?: Date | null;
  sourceLastLoginAt?: Date | null;
  welfareBalanceFen?: bigint | null;
  pointsBalance: number | null;
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

type RawNewMemberSummary = {
  newMembersToday: number | bigint | string | null;
  newMembersThisWeek: number | bigint | string | null;
  newMembersThisMonth: number | bigint | string | null;
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

function externalInteger(row: JeeSiteMemberRow, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function externalYuanFen(row: JeeSiteMemberRow, key: string): bigint | null {
  const value = row[key];
  if (value === null || value === undefined || value === '') return null;
  return parseYuanStringToFen(String(value));
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
    sourceStatus: externalString(row, 'status'),
    sourceIdentity: externalInteger(row, 'identity'),
    sourceCreatedAt: parseJeeSiteDate(row.createDate),
    sourceUpdatedAt: parseJeeSiteDate(row.updateDate),
    sourceLastLoginAt: parseJeeSiteDate(row.loginDate),
    // JeeSite semantics: point is welfare money; bonus is points.
    welfareBalanceFen: externalYuanFen(row, 'point'),
    pointsBalance: externalInteger(row, 'bonus'),
    walletBalanceFen: null,
    totalGmvFen: null,
    firstOrderAt: null,
    lastOrderAt: null,
    totalOrders: 0,
    tags: null
  };
}

function mapDirectoryMember(row: {
  memberId: string;
  inviteCode: string | null;
  parentInviteCode: string | null;
  nickname: string | null;
  phone: string | null;
  level: string | null;
  sourceStatus: string | null;
  sourceIdentity: number | null;
  sourceCreatedAt: Date | null;
  sourceUpdatedAt: Date | null;
  sourceLastLoginAt: Date | null;
  welfareBalanceFen: bigint | null;
  pointsBalance: number | null;
}): MemberRow {
  return {
    memberId: row.memberId,
    inviteCode: row.inviteCode,
    parentInviteCode: row.parentInviteCode,
    nickname: row.nickname,
    phone: row.phone,
    level: row.level,
    sourceStatus: row.sourceStatus,
    sourceIdentity: row.sourceIdentity,
    sourceCreatedAt: row.sourceCreatedAt,
    sourceUpdatedAt: row.sourceUpdatedAt,
    sourceLastLoginAt: row.sourceLastLoginAt,
    welfareBalanceFen: row.welfareBalanceFen,
    pointsBalance: row.pointsBalance,
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
    level: external.level ?? local?.level ?? null,
    welfareBalanceFen: external.welfareBalanceFen ?? local?.welfareBalanceFen ?? null,
    // External directory semantics win. The current member list has no bonus
    // field, so do not turn a local default zero into a claimed source balance.
    pointsBalance: external.pointsBalance
  };
}

function mergeExternalMemberProfile(
  local: MemberRow | undefined,
  directory: MemberRow | undefined,
  external: MemberRow
): MemberRow {
  const snapshot = directory ? mergeMemberProfile(local, directory) : local;
  const merged = mergeMemberProfile(snapshot, external);
  return {
    ...merged,
    welfareBalanceFen: external.welfareBalanceFen ?? directory?.welfareBalanceFen ?? null,
    pointsBalance: external.pointsBalance ?? directory?.pointsBalance ?? null
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
    sourceCreatedAt: dateToString(member.sourceCreatedAt),
    sourceUpdatedAt: dateToString(member.sourceUpdatedAt),
    sourceLastLoginAt: dateToString(member.sourceLastLoginAt),
    welfareBalanceFen: fenToString(member.welfareBalanceFen),
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
  private readonly logger = new Logger(UserCenterService.name);
  private readonly externalMemberPageInFlight = new Map<
    string,
    Promise<UserCenterListPayload>
  >();
  private externalMemberPageQueue: Promise<void> = Promise.resolve();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(JeeSiteMemberClient) private readonly jeeSiteMemberClient?: JeeSiteMemberClient,
    @Optional() @Inject(JobRunnerService) private readonly jobRunner?: JobRunnerService
  ) {}

  async listMembers(query: UserCenterListQueryDto): Promise<UserCenterListPayload> {
    try {
      if (this.jeeSiteMemberClient && process.env.EXTERNAL_API_BASE_URL) {
        const snapshot = await getLatestSuccessfulMemberDirectorySnapshot(this.prisma);
        try {
          // Read the requested source page first. A completed snapshot only
          // enriches the page and provides a fallback; it must not turn a
          // page click into a full local replay.
          return await this.listExternalMembers(query, true, snapshot ?? undefined);
        } catch (error) {
          if (snapshot) return this.listDirectoryMembers(query, true, snapshot);
          // If the upstream is unavailable before the first completed refresh,
          // keep the already imported local directory visible instead of
          // turning a transient timeout into an empty user center.
          const localCount = await this.prisma.member.count().catch(() => 0);
          if (localCount > 0) return this.listLocalMembers(query, true);
          throw error;
        }
      }
      return await this.listLocalMembers(query, true);
    } catch (error) {
      // The running dev DB can lag one migration behind while the API is open.
      // Keep the list usable until the migration can be applied during maintenance.
      const missingInvitationColumns = isMissingInvitationColumnError(error);
      const missingDirectoryTable = isMissingMemberDirectoryTableError(error);
      if (!missingInvitationColumns && !missingDirectoryTable) throw error;
      if (this.jeeSiteMemberClient && process.env.EXTERNAL_API_BASE_URL) {
        if (missingDirectoryTable) {
          return this.listExternalMembers(query, !missingInvitationColumns);
        }
        const snapshot = await getLatestSuccessfulMemberDirectorySnapshot(this.prisma);
        return this.listExternalMembers(query, false, snapshot ?? undefined);
      }
      return this.listLocalMembers(query, false);
    }
  }

  startRefreshJob(): UserCenterRefreshJob {
    if (!this.jeeSiteMemberClient || !process.env.EXTERNAL_API_BASE_URL) {
      throw new ServiceUnavailableException('外部会员数据源未配置，无法刷新用户目录');
    }
    return startUserCenterRefreshJob({
      client: this.jeeSiteMemberClient,
      prepareSnapshot: (generation) => this.prepareMemberDirectorySnapshot(generation),
      persistPage: (rows, generation) => this.persistMemberDirectoryPage(rows, generation),
      finalizeSnapshot: (generation) => this.activateMemberDirectorySnapshot(generation),
      discardSnapshot: (generation) => this.discardMemberDirectorySnapshot(generation),
      jobRunner: this.jobRunner
    });
  }

  async getActiveRefreshJob(): Promise<UserCenterRefreshJob | undefined> {
    return getActivePersistedOrInMemoryUserCenterRefreshJob(this.jobRunner);
  }

  async getRefreshJob(jobId: string): Promise<UserCenterRefreshJob | undefined> {
    return (
      getUserCenterRefreshJob(jobId) ??
      (await getPersistedUserCenterRefreshJob(jobId, this.jobRunner))
    );
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
      this.prisma.member.findMany({ where, select: { memberId: true, firstSeenAt: true } })
    ]);

    const matchingMemberIds = matchingMembers.map((member) => member.memberId);
    const newMemberSummary = countNewMembersByCreatedAt(
      matchingMembers.map((member) => member.firstSeenAt)
    );
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
        ...newMemberSummary,
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
    includeInvitationHierarchy: boolean,
    directorySnapshot?: MemberDirectorySnapshot
  ): Promise<UserCenterListPayload> {
    const requestKey = JSON.stringify({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search?.trim() || undefined,
      level: query.level?.trim() || undefined,
      includeInvitationHierarchy,
      directorySnapshot
    });
    const inFlight = this.externalMemberPageInFlight.get(requestKey);
    if (inFlight) return inFlight;

    const request = this.enqueueExternalMemberPage(async () => {
      const externalPage = await this.jeeSiteMemberClient!.listMembers({
        page: query.page,
        pageSize: query.pageSize,
        search: query.search,
        level: query.level
      });
      const externalMembers = externalPage.list
        .map(mapExternalMember)
        .filter((member): member is MemberRow => Boolean(member));
      return this.composeExternalMemberPage(
        externalMembers,
        {
          page: externalPage.pageNo,
          pageSize: externalPage.pageSize,
          total: externalPage.count
        },
        includeInvitationHierarchy,
        directorySnapshot
          ? ['JeeSite Member', 'MemberDirectoryEntry', 'OrderHeader']
          : ['JeeSite Member', 'OrderHeader'],
        Boolean(directorySnapshot),
        directorySnapshot
      );
    });
    this.externalMemberPageInFlight.set(requestKey, request);
    void request.then(
      () => {
        if (this.externalMemberPageInFlight.get(requestKey) === request) {
          this.externalMemberPageInFlight.delete(requestKey);
        }
      },
      () => {
        if (this.externalMemberPageInFlight.get(requestKey) === request) {
          this.externalMemberPageInFlight.delete(requestKey);
        }
      }
    );
    return request;
  }

  private enqueueExternalMemberPage<T>(task: () => Promise<T>): Promise<T> {
    const queued = this.externalMemberPageQueue.then(task, task);
    this.externalMemberPageQueue = queued.then(
      () => undefined,
      () => undefined
    );
    return queued;
  }

  private async listDirectoryMembers(
    query: UserCenterListQueryDto,
    includeInvitationHierarchy: boolean,
    snapshot: MemberDirectorySnapshot
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
    const select = {
      memberId: true,
      inviteCode: true,
      parentInviteCode: true,
      nickname: true,
      phone: true,
      level: true,
      sourceStatus: true,
      sourceIdentity: true,
      sourceCreatedAt: true,
      sourceUpdatedAt: true,
      sourceLastLoginAt: true,
      welfareBalanceFen: true,
      pointsBalance: true
    } as const;
    const [total, entries] =
      snapshot.source === 'staging' && this.prisma.memberDirectoryRefreshEntry
        ? await Promise.all([
            this.prisma.memberDirectoryRefreshEntry.count({
              where: {
                generation: snapshot.generation,
                ...(query.level?.trim() ? { level: query.level.trim() } : {}),
                ...(search ? { OR: searchFields } : {})
              }
            }),
            this.prisma.memberDirectoryRefreshEntry.findMany({
              where: {
                generation: snapshot.generation,
                ...(query.level?.trim() ? { level: query.level.trim() } : {}),
                ...(search ? { OR: searchFields } : {})
              },
              orderBy: [{ lastSeenAt: 'desc' }, { memberId: 'asc' }],
              skip: (query.page - 1) * query.pageSize,
              take: query.pageSize,
              select
            })
          ])
        : await Promise.all([
            this.prisma.memberDirectoryEntry.count({
              where: {
                lastSyncGeneration: snapshot.generation,
                ...(query.level?.trim() ? { level: query.level.trim() } : {}),
                ...(search ? { OR: searchFields } : {})
              }
            }),
            this.prisma.memberDirectoryEntry.findMany({
              where: {
                lastSyncGeneration: snapshot.generation,
                ...(query.level?.trim() ? { level: query.level.trim() } : {}),
                ...(search ? { OR: searchFields } : {})
              },
              orderBy: [{ lastSeenAt: 'desc' }, { memberId: 'asc' }],
              skip: (query.page - 1) * query.pageSize,
              take: query.pageSize,
              select
            })
          ]);
    return this.composeExternalMemberPage(
      entries.map(mapDirectoryMember),
      {
        page: query.page,
        pageSize: query.pageSize,
        total
      },
      includeInvitationHierarchy,
      ['JeeSite Member', 'MemberDirectoryEntry', 'OrderHeader'],
      true,
      snapshot
    );
  }

  private async composeExternalMemberPage(
    externalMembers: MemberRow[],
    pagination: { page: number; pageSize: number; total: number },
    includeInvitationHierarchy: boolean,
    dataSources: string[],
    useDirectorySnapshot: boolean,
    directorySnapshot?: MemberDirectorySnapshot
  ): Promise<UserCenterListPayload> {
    const directoryGeneration = directorySnapshot?.generation;
    const memberIds = externalMembers.map((member) => member.memberId);
    const activeSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [
      localMembers,
      directoryMembers,
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
        memberIds.length && useDirectorySnapshot && directorySnapshot && directoryGeneration
          ? directorySnapshot.source === 'staging' && this.prisma.memberDirectoryRefreshEntry
            ? this.prisma.memberDirectoryRefreshEntry.findMany({
                where: { memberId: { in: memberIds }, generation: directoryGeneration },
                select: {
                  memberId: true,
                  inviteCode: true,
                  parentInviteCode: true,
                  nickname: true,
                  phone: true,
                  level: true,
                  sourceStatus: true,
                  sourceIdentity: true,
                  sourceCreatedAt: true,
                  sourceUpdatedAt: true,
                  sourceLastLoginAt: true,
                  welfareBalanceFen: true,
                  pointsBalance: true
                }
              })
            : this.prisma.memberDirectoryEntry
              ? this.prisma.memberDirectoryEntry.findMany({
                  where: { memberId: { in: memberIds }, lastSyncGeneration: directoryGeneration },
                  select: {
                    memberId: true,
                    inviteCode: true,
                    parentInviteCode: true,
                    nickname: true,
                    phone: true,
                    level: true,
                    sourceStatus: true,
                    sourceIdentity: true,
                    sourceCreatedAt: true,
                    sourceUpdatedAt: true,
                    sourceLastLoginAt: true,
                    welfareBalanceFen: true,
                    pointsBalance: true
                  }
                })
              : []
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
    const directoryById = new Map(
      directoryMembers.map((member) => [member.memberId, mapDirectoryMember(member)])
    );
    const totals = orderTotals[0] ?? { totalOrders: 0, totalGmvFen: null };
    const memberSummary = memberSummaryRows[0] ?? { paidMembers: 0, activeMembers30d: 0 };
    const downlineCountByInviteCode = await this.loadDownlineCounts(
      externalMembers,
      includeInvitationHierarchy,
      useDirectorySnapshot,
      directorySnapshot
    );
    const newMemberSummary =
      directorySnapshot && directoryGeneration
        ? await this.loadDirectoryNewMemberSummary(directorySnapshot)
        : unavailableNewMemberSummary();

    return {
      items: externalMembers.map((externalMember) => {
        const member = mergeExternalMemberProfile(
          localById.get(externalMember.memberId),
          directoryById.get(externalMember.memberId),
          externalMember
        );
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
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: pagination.total,
        hasMore: pagination.page * pagination.pageSize < pagination.total
      },
      summary: {
        ...newMemberSummary,
        totalMembers: pagination.total,
        paidMembers: Number(memberSummary.paidMembers),
        activeMembers30d: Number(memberSummary.activeMembers30d),
        totalOrders: Number(totals.totalOrders),
        totalGmvFen: fenToString(fenBigIntOrNull(totals.totalGmvFen))
      },
      dataSources
    };
  }

  private async loadDirectoryNewMemberSummary(
    snapshot: MemberDirectorySnapshot
  ): Promise<NewMemberSummary> {
    const windows = getNewMemberWindows();
    const table = snapshot.source === 'staging' ? 'MemberDirectoryRefreshEntry' : 'MemberDirectoryEntry';
    const generationColumn = snapshot.source === 'staging' ? 'generation' : 'lastSyncGeneration';
    const rows = await this.prisma.$queryRawUnsafe<RawNewMemberSummary[]>(
      `SELECT
         COUNT(DISTINCT CASE
           WHEN ${sqlDatetime('"sourceCreatedAt"')} >= datetime(?)
            AND ${sqlDatetime('"sourceCreatedAt"')} < datetime(?)
           THEN "memberId"
         END) AS "newMembersToday",
         COUNT(DISTINCT CASE
           WHEN ${sqlDatetime('"sourceCreatedAt"')} >= datetime(?)
            AND ${sqlDatetime('"sourceCreatedAt"')} < datetime(?)
           THEN "memberId"
         END) AS "newMembersThisWeek",
         COUNT(DISTINCT CASE
           WHEN ${sqlDatetime('"sourceCreatedAt"')} >= datetime(?)
            AND ${sqlDatetime('"sourceCreatedAt"')} < datetime(?)
           THEN "memberId"
         END) AS "newMembersThisMonth"
       FROM "${table}"
       WHERE "${generationColumn}" = ?`,
      toSqliteDateTime(windows.today.start),
      toSqliteDateTime(windows.today.end),
      toSqliteDateTime(windows.thisWeek.start),
      toSqliteDateTime(windows.thisWeek.end),
      toSqliteDateTime(windows.thisMonth.start),
      toSqliteDateTime(windows.thisMonth.end),
      snapshot.generation
    );
    const row = Array.isArray(rows) ? rows[0] : undefined;
    return {
      newMembersToday: Number(row?.newMembersToday ?? 0),
      newMembersThisWeek: Number(row?.newMembersThisWeek ?? 0),
      newMembersThisMonth: Number(row?.newMembersThisMonth ?? 0),
      newMembersBasis: 'sourceCreatedAt'
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
    includeInvitationHierarchy: boolean,
    useDirectorySnapshot = false,
    directorySnapshot?: MemberDirectorySnapshot
  ): Promise<Map<string, number>> {
    if (!includeInvitationHierarchy) return new Map();
    const inviteCodes = members
      .map((member) => member.inviteCode)
      .filter((inviteCode): inviteCode is string => Boolean(inviteCode));
    if (!inviteCodes.length) return new Map();
    if (useDirectorySnapshot && !directorySnapshot) return new Map();
    const groups = useDirectorySnapshot && directorySnapshot
      ? directorySnapshot.source === 'staging' && this.prisma.memberDirectoryRefreshEntry
        ? await this.prisma.memberDirectoryRefreshEntry.groupBy({
            by: ['parentInviteCode'],
            where: {
              parentInviteCode: { in: inviteCodes },
              generation: directorySnapshot.generation
            },
            _count: { _all: true }
          })
        : await this.prisma.memberDirectoryEntry.groupBy({
            by: ['parentInviteCode'],
            where: {
              parentInviteCode: { in: inviteCodes },
              lastSyncGeneration: directorySnapshot.generation
            },
            _count: { _all: true }
          })
      : await this.prisma.member.groupBy({
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

  private async prepareMemberDirectorySnapshot(generation: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM "MemberDirectoryRefreshEntry" WHERE "generation" = ?`,
      generation
    );
  }

  private async discardMemberDirectorySnapshot(generation: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `DELETE FROM "MemberDirectoryRefreshEntry" WHERE "generation" = ?`,
      generation
    );
  }

  private async activateMemberDirectorySnapshot(generation: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<{ count: number | bigint }>>(
        `SELECT COUNT(*) AS "count"
         FROM "MemberDirectoryRefreshEntry"
         WHERE "generation" = ?`,
        generation
      );
      if (Number(rows[0]?.count ?? 0) === 0) {
        throw new Error('会员目录 staging 为空，未切换活动快照');
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO "MemberDirectorySnapshotState" ("id", "generation", "activatedAt")
         VALUES ('active', ?, datetime('now'))
         ON CONFLICT("id") DO UPDATE SET
           "generation" = excluded."generation",
           "activatedAt" = excluded."activatedAt"`,
        generation
      );
    }, { timeout: 10_000, maxWait: 10_000 });

    // Cleanup is deliberately outside the pointer transaction. A cleanup
    // failure must not invalidate the newly published snapshot.
    try {
      await this.prisma.$executeRawUnsafe(
        `DELETE FROM "MemberDirectoryRefreshEntry" WHERE "generation" <> ?`,
        generation
      );
    } catch (error) {
      this.logger.warn(`会员目录旧 staging 清理失败，保留待下次清理: ${String(error)}`);
    }
  }

  private async persistMemberDirectoryPage(
    rows: JeeSiteMemberRow[],
    generation: string
  ): Promise<{ persisted: number; errors: number }> {
    const entries = rows
      .map(mapExternalMember)
      .filter((entry): entry is MemberRow => Boolean(entry));
    let persisted = 0;
    let errors = rows.length - entries.length;

    for (let offset = 0; offset < entries.length; offset += DIRECTORY_WRITE_BATCH_SIZE) {
      const chunk = entries.slice(offset, offset + DIRECTORY_WRITE_BATCH_SIZE);
      const values = chunk
        .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))')
        .join(',');
      const params = chunk.flatMap((entry) => [
        generation,
        entry.memberId,
        entry.inviteCode ?? null,
        entry.parentInviteCode ?? null,
        entry.nickname,
        entry.phone,
        entry.level,
        entry.welfareBalanceFen ?? null,
        entry.pointsBalance ?? null,
        entry.sourceStatus ?? null,
        entry.sourceIdentity ?? null,
        toJeeSiteSqliteDate(entry.sourceCreatedAt),
        toJeeSiteSqliteDate(entry.sourceUpdatedAt),
        toJeeSiteSqliteDate(entry.sourceLastLoginAt)
      ]);
      const sql = `INSERT INTO "MemberDirectoryRefreshEntry"
        ("generation", "memberId", "inviteCode", "parentInviteCode", "nickname", "phone", "level", "welfareBalanceFen", "pointsBalance", "sourceStatus", "sourceIdentity", "sourceCreatedAt", "sourceUpdatedAt", "sourceLastLoginAt", "firstSeenAt", "lastSeenAt")
        VALUES ${values}
        ON CONFLICT("generation", "memberId") DO UPDATE SET
          "inviteCode" = excluded."inviteCode",
          "parentInviteCode" = excluded."parentInviteCode",
          "nickname" = excluded."nickname",
          "phone" = excluded."phone",
          "level" = excluded."level",
          "welfareBalanceFen" = excluded."welfareBalanceFen",
          "pointsBalance" = excluded."pointsBalance",
          "sourceStatus" = excluded."sourceStatus",
          "sourceIdentity" = excluded."sourceIdentity",
          "sourceCreatedAt" = excluded."sourceCreatedAt",
          "sourceUpdatedAt" = excluded."sourceUpdatedAt",
          "sourceLastLoginAt" = excluded."sourceLastLoginAt",
          "lastSeenAt" = excluded."lastSeenAt"`;

      try {
        await this.prisma.$executeRawUnsafe(sql, ...params);
        persisted += chunk.length;
      } catch {
        // One malformed row must not discard the other 99 valid rows.
        for (const entry of chunk) {
          try {
            await this.prisma.$executeRawUnsafe(
              `INSERT INTO "MemberDirectoryRefreshEntry"
                ("generation", "memberId", "inviteCode", "parentInviteCode", "nickname", "phone", "level", "welfareBalanceFen", "pointsBalance", "sourceStatus", "sourceIdentity", "sourceCreatedAt", "sourceUpdatedAt", "sourceLastLoginAt", "firstSeenAt", "lastSeenAt")
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
               ON CONFLICT("generation", "memberId") DO UPDATE SET
                 "inviteCode" = excluded."inviteCode",
                 "parentInviteCode" = excluded."parentInviteCode",
                 "nickname" = excluded."nickname",
                 "phone" = excluded."phone",
                 "level" = excluded."level",
                 "welfareBalanceFen" = excluded."welfareBalanceFen",
                 "pointsBalance" = excluded."pointsBalance",
                 "sourceStatus" = excluded."sourceStatus",
                 "sourceIdentity" = excluded."sourceIdentity",
                 "sourceCreatedAt" = excluded."sourceCreatedAt",
                 "sourceUpdatedAt" = excluded."sourceUpdatedAt",
                 "sourceLastLoginAt" = excluded."sourceLastLoginAt",
                 "lastSeenAt" = excluded."lastSeenAt"`,
              generation,
              entry.memberId,
              entry.inviteCode ?? null,
              entry.parentInviteCode ?? null,
               entry.nickname,
               entry.phone,
               entry.level,
               entry.welfareBalanceFen ?? null,
               entry.pointsBalance ?? null,
               entry.sourceStatus ?? null,
              entry.sourceIdentity ?? null,
              toJeeSiteSqliteDate(entry.sourceCreatedAt),
              toJeeSiteSqliteDate(entry.sourceUpdatedAt),
              toJeeSiteSqliteDate(entry.sourceLastLoginAt)
            );
            persisted += 1;
          } catch {
            errors += 1;
          }
        }
      }
    }
    return { persisted, errors };
  }

  private async findDirectoryMember(
    memberId: string,
    snapshot: MemberDirectorySnapshot | null
  ): Promise<MemberRow | null> {
    if (!snapshot) return null;
    try {
      const select = {
        memberId: true,
        inviteCode: true,
        parentInviteCode: true,
        nickname: true,
        phone: true,
        level: true,
        sourceStatus: true,
        sourceIdentity: true,
        sourceCreatedAt: true,
        sourceUpdatedAt: true,
        sourceLastLoginAt: true,
        welfareBalanceFen: true,
        pointsBalance: true
      } as const;
      const row =
        snapshot.source === 'staging' && this.prisma.memberDirectoryRefreshEntry
          ? await this.prisma.memberDirectoryRefreshEntry.findFirst({
              where: { memberId, generation: snapshot.generation },
              select
            })
          : this.prisma.memberDirectoryEntry
            ? await this.prisma.memberDirectoryEntry.findFirst({
                where: { memberId, lastSyncGeneration: snapshot.generation },
                select
              })
            : null;
      return row ? mapDirectoryMember(row) : null;
    } catch (error) {
      if (isMissingMemberDirectoryTableError(error)) return null;
      throw error;
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
    const directorySnapshot =
      this.jeeSiteMemberClient && process.env.EXTERNAL_API_BASE_URL
        ? await getLatestSuccessfulMemberDirectorySnapshot(this.prisma)
        : null;
    const localMember = await this.prisma.member.findUnique({
      where: { memberId },
      select: includeInvitationHierarchy ? LOCAL_MEMBER_SELECT : LEGACY_MEMBER_SELECT
    });
    let member: MemberRow;
    let externalProfile = false;
    const directoryMember = await this.findDirectoryMember(memberId, directorySnapshot);
    if (localMember) {
      member = directoryMember ? mergeMemberProfile(localMember, directoryMember) : localMember;
    } else if (this.jeeSiteMemberClient && process.env.EXTERNAL_API_BASE_URL) {
      if (directoryMember) {
        member = directoryMember;
        externalProfile = true;
      } else {
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
      }
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
      if (directorySnapshot) {
        try {
          downlineCount =
            directorySnapshot.source === 'staging' && this.prisma.memberDirectoryRefreshEntry
              ? await this.prisma.memberDirectoryRefreshEntry.count({
                  where: {
                    parentInviteCode: member.inviteCode,
                    generation: directorySnapshot.generation
                  }
                })
              : this.prisma.memberDirectoryEntry
                ? await this.prisma.memberDirectoryEntry.count({
                    where: {
                      parentInviteCode: member.inviteCode,
                      lastSyncGeneration: directorySnapshot.generation
                    }
                  })
                : 0;
        } catch (error) {
          if (!isMissingMemberDirectoryTableError(error)) throw error;
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
