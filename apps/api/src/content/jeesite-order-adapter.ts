import { nowISO } from '../common/format';
import { extractRows, rowDateText, rowNumber, rowText } from './jeesite-row-reader';

export interface MappedOrderRecord {
  orderId: string;
  memberId: string;
  memberName: string;
  memberPhone: string;
  packageId: string;
  merchantId: string;
  merchantName: string;
  areaId: string;
  areaName: string;
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

export function mapJeesiteOrderListToDataset(payload: unknown): {
  orders: MappedOrderRecord[];
} {
  const orders: MappedOrderRecord[] = [];

  for (const row of extractRows(payload)) {
    const orderId = rowText(row, ['id', 'orderId', 'orderCode']);
    if (!orderId) continue;

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

    orders.push({
      orderId,
      memberId: rowText(row, ['centerMemberId', 'centerMember.id']),
      memberName: rowText(row, ['memberName']),
      memberPhone: rowText(row, ['memberPhone']),
      packageId: rowText(row, ['bargainCommodityId', 'bargainCommodity.id']),
      merchantId: rowText(row, ['corePartnerId', 'corePartner.id']),
      merchantName: rowText(row, ['corePartner.name', 'businessUserName']),
      areaId: rowText(row, ['areaId', 'districtId', 'cityId']),
      areaName: rowText(row, ['areaName', 'districtName', 'cityName']),
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
