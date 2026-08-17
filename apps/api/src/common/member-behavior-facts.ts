import type { PrismaService } from '../prisma/prisma.service';
import { sqlDatetime } from './sqlite-datetime';
import type { MemberDirectorySnapshotSource } from '../user-center/member-directory-snapshot';

export interface MemberBehaviorFact {
  memberId: string;
  nickname: string | null;
  phone: string | null;
  level: string | null;
  pointsBalance: number;
  totalOrders: number;
  totalGmvFen: bigint | null;
  paidOrderCount: number;
  paidGmvFen: bigint | null;
  firstPaidAt: Date | null;
  lastPaidAt: Date | null;
  daysSinceLastPaid: number | null;
  sourceCreatedAt?: Date | null;
  sourceUpdatedAt?: Date | null;
  sourceLastLoginAt?: Date | null;
  lastActivityAt?: Date | null;
  daysSinceLastActivity?: number | null;
}

export interface MemberBehaviorFactOptions {
  /** Read the external member master from one completed local snapshot. */
  directoryGeneration?: string | null;
  directorySource?: MemberDirectorySnapshotSource;
}

type RawMemberOrderFact = {
  memberId: string;
  totalOrders: number | bigint;
  paidOrderCount: number | bigint;
  paidGmvFen: number | bigint | null;
  firstPaidAt: string | null;
  lastPaidAt: string | null;
};

type DirectoryProfile = {
  memberId: string;
  nickname: string | null;
  phone: string | null;
  level: string | null;
  pointsBalance: number | null;
  sourceCreatedAt: Date | null;
  sourceUpdatedAt: Date | null;
  sourceLastLoginAt: Date | null;
};

function toBigInt(value: number | bigint | null | undefined): bigint | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'bigint' ? value : BigInt(Math.trunc(value));
}

function parseSqliteDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysSince(date: Date | null, now: Date): number | null {
  if (!date) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86400000));
}

/**
 * Loads the order facts shared by lifecycle analytics and rule-based tags.
 * Paid metrics intentionally use paidTime so the two features share one time definition.
 * Lifecycle analytics may add profile/activity timestamps from a completed
 * external directory snapshot without making another upstream request.
 */
export async function loadMemberBehaviorFacts(
  prisma: PrismaService,
  now = new Date(),
  options: MemberBehaviorFactOptions = {}
): Promise<MemberBehaviorFact[]> {
  const [members, orderRows, directoryProfiles] = await Promise.all([
    prisma.member.findMany({
      select: {
        memberId: true,
        nickname: true,
        phone: true,
        level: true,
        pointsBalance: true,
        totalOrders: true,
        totalGmvFen: true
      }
    }),
    prisma.$queryRawUnsafe<RawMemberOrderFact[]>(
      `SELECT
         "memberId" AS "memberId",
         COUNT(*) AS "totalOrders",
         SUM(CASE WHEN "paidTime" IS NOT NULL THEN 1 ELSE 0 END) AS "paidOrderCount",
         SUM(CASE WHEN "paidTime" IS NOT NULL THEN COALESCE("paidAmountFen", 0) ELSE 0 END) AS "paidGmvFen",
         MIN(CASE WHEN "paidTime" IS NOT NULL THEN ${sqlDatetime('"paidTime"')} END) AS "firstPaidAt",
         MAX(CASE WHEN "paidTime" IS NOT NULL THEN ${sqlDatetime('"paidTime"')} END) AS "lastPaidAt"
       FROM "OrderHeader"
       WHERE "memberId" IS NOT NULL
      GROUP BY "memberId"`
    ),
    options.directoryGeneration && options.directorySource === 'staging' && prisma.memberDirectoryRefreshEntry
      ? prisma.memberDirectoryRefreshEntry
          .findMany({
            where: { generation: options.directoryGeneration },
            select: {
              memberId: true,
              nickname: true,
              phone: true,
              level: true,
              pointsBalance: true,
              sourceCreatedAt: true,
              sourceUpdatedAt: true,
              sourceLastLoginAt: true
            }
          })
          .catch(() => null)
      : options.directoryGeneration && prisma.memberDirectoryEntry
        ? prisma.memberDirectoryEntry
            .findMany({
              where: { lastSyncGeneration: options.directoryGeneration },
              select: {
                memberId: true,
                nickname: true,
                phone: true,
                level: true,
                pointsBalance: true,
                sourceCreatedAt: true,
                sourceUpdatedAt: true,
                sourceLastLoginAt: true
              }
            })
            .catch(() => null)
        : Promise.resolve(null)
  ]);

  const orderByMember = new Map(orderRows.map((row) => [row.memberId, row]));
  const localById = new Map(members.map((member) => [member.memberId, member]));
  const profiles: DirectoryProfile[] = directoryProfiles
    ? directoryProfiles
    : members.map((member) => ({
        memberId: member.memberId,
        nickname: member.nickname,
        phone: member.phone,
        level: member.level,
        pointsBalance: member.pointsBalance,
        sourceCreatedAt: null,
        sourceUpdatedAt: null,
        sourceLastLoginAt: null
      }));

  return profiles.map((profile) => {
    const localMember = localById.get(profile.memberId);
    const order = orderByMember.get(profile.memberId);
    const paidOrderCount = Number(order?.paidOrderCount ?? 0);
    const firstPaidAt = parseSqliteDate(order?.firstPaidAt);
    const lastPaidAt = parseSqliteDate(order?.lastPaidAt);
    const lastActivityAt = [
      lastPaidAt,
      profile.sourceLastLoginAt,
      profile.sourceUpdatedAt,
      profile.sourceCreatedAt
    ].reduce<Date | null>(
      (latest, value) => (!value || (latest && latest >= value) ? latest : value),
      null
    );
    return {
      memberId: profile.memberId,
      nickname: profile.nickname ?? localMember?.nickname ?? null,
      phone: profile.phone ?? localMember?.phone ?? null,
      level: profile.level ?? localMember?.level ?? null,
      pointsBalance: profile.pointsBalance ?? localMember?.pointsBalance ?? 0,
      totalOrders: Number(order?.totalOrders ?? localMember?.totalOrders ?? 0),
      totalGmvFen:
        paidOrderCount > 0 ? toBigInt(order?.paidGmvFen) : (localMember?.totalGmvFen ?? null),
      paidOrderCount,
      paidGmvFen: paidOrderCount > 0 ? toBigInt(order?.paidGmvFen) : null,
      firstPaidAt,
      lastPaidAt,
      daysSinceLastPaid: daysSince(lastPaidAt, now),
      sourceCreatedAt: profile.sourceCreatedAt,
      sourceUpdatedAt: profile.sourceUpdatedAt,
      sourceLastLoginAt: profile.sourceLastLoginAt,
      lastActivityAt,
      daysSinceLastActivity: daysSince(lastActivityAt, now)
    };
  });
}
