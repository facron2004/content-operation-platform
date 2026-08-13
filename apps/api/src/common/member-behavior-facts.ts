import type { PrismaService } from '../prisma/prisma.service';
import { sqlDatetime } from './sqlite-datetime';

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
}

type RawMemberOrderFact = {
  memberId: string;
  totalOrders: number | bigint;
  paidOrderCount: number | bigint;
  paidGmvFen: number | bigint | null;
  firstPaidAt: string | null;
  lastPaidAt: string | null;
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
 */
export async function loadMemberBehaviorFacts(
  prisma: PrismaService,
  now = new Date()
): Promise<MemberBehaviorFact[]> {
  const [members, orderRows] = await Promise.all([
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
    )
  ]);

  const orderByMember = new Map(orderRows.map((row) => [row.memberId, row]));
  return members.map((member) => {
    const order = orderByMember.get(member.memberId);
    const paidOrderCount = Number(order?.paidOrderCount ?? 0);
    const firstPaidAt = parseSqliteDate(order?.firstPaidAt);
    const lastPaidAt = parseSqliteDate(order?.lastPaidAt);
    return {
      memberId: member.memberId,
      nickname: member.nickname,
      phone: member.phone,
      level: member.level,
      pointsBalance: member.pointsBalance,
      totalOrders: Number(order?.totalOrders ?? member.totalOrders),
      totalGmvFen: paidOrderCount > 0 ? toBigInt(order?.paidGmvFen) : member.totalGmvFen,
      paidOrderCount,
      paidGmvFen: paidOrderCount > 0 ? toBigInt(order?.paidGmvFen) : null,
      firstPaidAt,
      lastPaidAt,
      daysSinceLastPaid: daysSince(lastPaidAt, now)
    };
  });
}
