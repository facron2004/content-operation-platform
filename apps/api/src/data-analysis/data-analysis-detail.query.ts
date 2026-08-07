/** Detail-row query and presentation mapping for the data-analysis report. */
import { maskPhone as maskPhonePii, sqlDatetimeExclusiveRange } from '../common';
import { type DataAnalysisOrderDetailRow } from './data-analysis.dto';
import { type PrismaLike, REFUND_COMPONENTS_FEN, fenToYuan, n } from './data-analysis-query.shared';
import { paidTimeBounds } from './data-analysis-window';

type DetailSqlRow = {
  merchantName: string | null;
  orderId: string;
  orderCode: string | null;
  packageName: string | null;
  memberNickname: string | null;
  memberPhone: string | null;
  paidAmountFen: bigint | null;
  orderAmountFen: bigint | null;
  walletAmountFen: bigint | null;
  pointUsed: number | null;
  refundAmountFen: bigint | null;
  coupon: string | null;
  salesman: string | null;
  parentSalesman: string | null;
  status: string | null;
  paidTime: string | null;
  verifyTime: string | null;
};

/** Prefer platform maskPhone — short / foreign phones must never leak raw. */
function maskMemberPhone(phone: string | null | undefined): string {
  return maskPhonePii(phone) ?? '';
}

function statusLabel(status: string | null | undefined, verifyTime: string | null): string {
  if (status === 'refunded') return '已退款';
  if (status === 'verified' || verifyTime) return '待评价';
  if (status === 'paid') return '已发货';
  if (status === 'cancelled') return '已取消';
  return status || '';
}

function verifyLabel(status: string | null | undefined, verifyTime: string | null): string {
  if (status === 'verified' || verifyTime) return '已核销';
  if (status === 'cancelled') return '已过期';
  if (status === 'refunded') return '已退款';
  return '待核销';
}

function fmtTime(v: string | null | undefined): string {
  if (!v) return '';
  // Normalize ISO / space form to "YYYY-MM-DD HH:MM:SS"
  const s = String(v)
    .replace('T', ' ')
    .replace(/Z$/, '')
    .replace(/\.\d+$/, '');
  return s.length >= 19 ? s.slice(0, 19) : s;
}

export async function queryOrderDetails(
  prisma: PrismaLike,
  startDate: string,
  endDate: string,
  limit: number
): Promise<{ rows: DataAnalysisOrderDetailRow[]; truncated: boolean }> {
  const { startBound, endBound } = paidTimeBounds(startDate, endDate);
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT
       oh."merchantName" AS "merchantName",
       oh."orderId" AS "orderId",
       oh."orderCode" AS "orderCode",
       cp."packageName" AS "packageName",
       m."nickname" AS "memberNickname",
       m."phone" AS "memberPhone",
       oh."paidAmountFen" AS "paidAmountFen",
       oh."orderAmountFen" AS "orderAmountFen",
       oh."paidAmountWalletFen" AS "walletAmountFen",
       oh."pointUsed" AS "pointUsed",
       CASE WHEN COALESCE(oh."refundAmountFen", 0) > 0
         THEN ${REFUND_COMPONENTS_FEN('oh.')} ELSE 0 END AS "refundAmountFen",
       oh."coupon" AS "coupon",
       oh."salesman" AS "salesman",
       oh."parentSalesman" AS "parentSalesman",
       oh."status" AS "status",
       oh."paidTime" AS "paidTime",
       oh."verifyTime" AS "verifyTime"
     FROM "OrderHeader" oh
     LEFT JOIN "ContentPackage" cp ON cp."packageId" = oh."packageId"
     LEFT JOIN "Member" m ON m."memberId" = oh."memberId"
     WHERE ${sqlDatetimeExclusiveRange('oh."paidTime"')}
     ORDER BY oh."paidTime" ASC, oh."orderId" ASC
     LIMIT ?`,
    startBound,
    endBound,
    limit + 1
  )) as DetailSqlRow[];

  const truncated = rows.length > limit;
  const slice = truncated ? rows.slice(0, limit) : rows;

  return {
    truncated,
    rows: slice.map((r) => ({
      merchantName: r.merchantName ?? '',
      // Prefer JeSite 展示单号 when present (matches template 订单编号)
      orderId: r.orderCode?.trim() || r.orderId,
      packageName: r.packageName ?? '',
      // Prefer masked phone; never fall back to raw nickname when phone is present-but-short.
      // Nickname alone is still exported (ops matching) — no phone digits.
      memberLabel: maskMemberPhone(r.memberPhone) || (r.memberNickname?.trim() ?? ''),
      paidAmount: fenToYuan(r.paidAmountFen),
      orderAmount: fenToYuan(r.orderAmountFen),
      walletAmount: fenToYuan(r.walletAmountFen),
      pointUsed: n(r.pointUsed),
      refundAmount: fenToYuan(r.refundAmountFen),
      coupon: r.coupon?.trim() || '',
      salesman: r.salesman?.trim() || '',
      parentSalesman: r.parentSalesman?.trim() || '',
      statusLabel: statusLabel(r.status, r.verifyTime),
      orderType: '虚拟卡券',
      verifyLabel: verifyLabel(r.status, r.verifyTime),
      paidTime: fmtTime(r.paidTime),
      verifyTime: fmtTime(r.verifyTime)
    }))
  };
}
