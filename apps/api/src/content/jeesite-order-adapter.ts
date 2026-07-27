import { nowISO } from '../common/format';
import { extractRows, rowDateText, rowNumber, rowText } from './jeesite-row-reader';

export interface MappedOrderRecord {
  orderId: string;
  /** 展示单号（K…）；无则空串 */
  orderCode: string;
  memberId: string;
  memberName: string;
  memberPhone: string;
  packageId: string;
  merchantId: string;
  merchantName: string;
  areaId: string;
  areaName: string;
  salesman: string;
  parentSalesman: string;
  coupon: string;
  orderTime: string;
  paidTime: string | null;
  verifyTime: string | null;
  refundTime: string | null;
  orderAmount: number;
  paidAmount: number;
  paidAmountWallet: number;
  paidAmountBonus: number;
  paidAmountCard: number;
  refundAmount: number;
  verifyAmount: number;
  pointEarned: number;
  pointUsed: number;
  status: 'paid' | 'verified' | 'cancelled' | 'refunded';
}

/**
 * JeSite bargainOrder/listData → 业务员/上级业务员/优惠券 候选键。
 *
 * 线上 listData 实测字段（2026-07）：
 *   businessUserName / businessUserParentName / centerMemberTicketTitle
 *   + nested bargainCommoditySys.businessUserName / businessParentUserName
 * 官方导出表头为中文「业务员/上级业务员/优惠券」；另保留 salesUserName 等候选
 * 兜底。空值不阻塞 ETL。
 *
 * 注意：businessUserName 在本接口是业务员，不是商家名。商家取 corePartner.name。
 */
const SALESMAN_KEYS = [
  'businessUserName',
  'bargainCommoditySys.businessUserName',
  'bargainCommoditySys.businessUserNames',
  'salesUserName',
  'salesmanName',
  'salesman',
  'agentUserName',
  'agentName',
  'salesUser.name',
  'agentUser.name',
  '业务员'
] as const;

const PARENT_SALESMAN_KEYS = [
  'businessUserParentName',
  'bargainCommoditySys.businessParentUserName',
  'parentSalesUserName',
  'parentSalesmanName',
  'parentSalesman',
  'parentAgentUserName',
  'parentAgentName',
  'parentUserName',
  'superiorSalesUserName',
  'parentSalesUser.name',
  'parentUser.name',
  '上级业务员'
] as const;

const COUPON_KEYS = [
  'centerMemberTicketTitle',
  'couponName',
  'couponInfo',
  'couponTitle',
  'coupon',
  'discountCouponName',
  'userCouponName',
  '优惠券'
] as const;

/**
 * 明确业务员字段：命中时即使与 merchantName 同名也不清空。
 * businessUserName 在 bargainOrder/listData 上就是业务员。
 */
const EXPLICIT_SALESMAN_KEYS = [
  'businessUserName',
  'bargainCommoditySys.businessUserName',
  'salesUserName',
  'salesmanName',
  'agentUserName',
  '业务员'
] as const;

export function mapJeesiteOrderListToDataset(payload: unknown): {
  orders: MappedOrderRecord[];
} {
  const orders: MappedOrderRecord[] = [];

  for (const row of extractRows(payload)) {
    // 主键优先雪花 id；展示单号单独落 orderCode，便于与导出 Excel「订单编号」对齐。
    const orderId = rowText(row, ['id', 'orderId']);
    if (!orderId) continue;
    const orderCode = rowText(row, ['orderCode', 'orderNo', 'orderSn', 'ordersNo', '订单编号']);

    const orderStatus = Math.round(rowNumber(row, ['orderStatus'], 0));
    const paidAmount = rowNumber(row, ['payPrice'], 0);
    const paidAmountWallet = rowNumber(row, ['deductionBalance'], 0);
    const paidAmountBonus = rowNumber(row, ['balanceIntegral'], 0) / 100;
    const settledAmount = paidAmount + paidAmountWallet;
    const orderTime = rowDateText(row, ['createDate', 'createDateStr'], nowISO());
    const payDate = rowDateText(
      row,
      ['payDate', 'pay_date', 'paymentDate', 'realityTime'],
      orderTime
    );
    const updatedTime = rowDateText(row, ['updateDate'], orderTime);
    const verifiedTime = rowDateText(row, ['verificationTime', 'updateDate'], updatedTime);

    const isVerified = orderStatus === 30 || orderStatus === 40;
    const isRefunded = orderStatus === -20 || orderStatus === -30;
    const isPaid = orderStatus === 20 || isVerified || isRefunded;
    const refundAmountRaw = rowNumber(row, ['refundPrice', 'refundAmount'], Number.NaN);
    const refundAmount = isRefunded
      ? Number.isFinite(refundAmountRaw)
        ? refundAmountRaw
        : settledAmount
      : 0;

    // 商家：corePartner.name 优先。不再把 businessUserName 当商家回退——
    // bargainOrder/listData 上 businessUserName 是业务员（见 SALESMAN_KEYS）。
    // 无 corePartner 时才用 corePartnerShopName；再无则空串。
    const merchantName = rowText(row, ['corePartner.name', 'corePartnerShopName']);
    const salesman = rowText(row, SALESMAN_KEYS);
    const hasExplicitSalesman = Boolean(rowText(row, EXPLICIT_SALESMAN_KEYS));
    // 若 salesman 与 merchantName 相同且并非来自明确业务员字段，清空业务员
    // （防御把商家名误记为业务员的旧 payload）。
    const salesmanClean =
      salesman && merchantName && salesman === merchantName && !hasExplicitSalesman ? '' : salesman;

    orders.push({
      orderId,
      orderCode,
      memberId: rowText(row, ['centerMemberId', 'centerMember.id']),
      memberName: rowText(row, ['memberName']),
      memberPhone: rowText(row, ['memberPhone']),
      packageId: rowText(row, ['bargainCommodityId', 'bargainCommodity.id']),
      merchantId: rowText(row, ['corePartnerId', 'corePartner.id']),
      merchantName,
      areaId: rowText(row, ['areaId', 'districtId', 'cityId']),
      areaName: rowText(row, ['areaName', 'districtName', 'cityName']),
      salesman: salesmanClean,
      parentSalesman: rowText(row, PARENT_SALESMAN_KEYS),
      coupon: rowText(row, COUPON_KEYS),
      orderTime,
      paidTime: isPaid ? payDate : null,
      verifyTime: isVerified ? verifiedTime : null,
      refundTime: isRefunded ? updatedTime : null,
      orderAmount: rowNumber(row, ['totalPrice'], settledAmount + paidAmountBonus),
      // 退款单：钱已退回，paidAmount 归零，GMV 不计入；refundAmount 记录退款额供独立分析
      paidAmount: isRefunded ? 0 : paidAmount,
      paidAmountWallet: isRefunded ? 0 : paidAmountWallet,
      paidAmountBonus: isRefunded ? 0 : paidAmountBonus,
      paidAmountCard: isRefunded ? 0 : Math.max(0, paidAmount - paidAmountWallet),
      refundAmount,
      verifyAmount: isVerified ? settledAmount : 0,
      pointEarned: 0,
      pointUsed: Math.round(rowNumber(row, ['balanceIntegral'], 0)),
      status: isRefunded ? 'refunded' : isVerified ? 'verified' : isPaid ? 'paid' : 'cancelled'
    });
  }

  return { orders };
}
