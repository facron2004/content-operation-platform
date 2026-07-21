import { futureISO } from '../common/format';
import { clampNonNegative, MS_PER_DAY } from '../domain/utils';
import { splitList } from './mappers';
import type { BargainCoreValues } from './jeesite-bargain-core';
import {
  normalizeRatio,
  rowDateText,
  rowMoney,
  rowNumber,
  rowText,
  type AnyRecord
} from './jeesite-row-reader';

export interface BargainMetrics {
  useRules: string[];
  sellingPoints: string[];
  exposureCount: number;
  clickCount: number;
  refundCount: number;
  verifyCount: number;
  gmv: number;
  refundAmount: number;
  soldCount: number;
  startTime: string;
  endTime: string;
  scoreSeed: number;
  bargainType: number;
  commissionRate: number;
}

export function readBargainMetrics(
  row: AnyRecord,
  core: BargainCoreValues,
  now: string
): BargainMetrics {
  const useRules = splitList(
    rowText(row, [
      'useRule',
      'use_rule',
      'rules',
      'rule',
      'limitDesc',
      'limit_desc',
      'notice',
      'tagText',
      'tag_text'
    ])
  );
  const sellingPoints = splitList(
    rowText(row, [
      'sellPoint',
      'sell_point',
      'sellingPoint',
      'selling_point',
      'subtitle',
      'summary',
      'description'
    ])
  );
  const exposureCount = Math.round(
    rowNumber(
      row,
      [
        'exposureCount',
        'exposure_count',
        'visitNum',
        'visit_num',
        'viewCount',
        'view_count',
        'pv',
        'bargainCommodityDynamic.hasHeatCount'
      ],
      Math.max(100, core.orderCount * 20)
    )
  );
  const clickCount = Math.round(
    rowNumber(
      row,
      ['clickCount', 'click_count', 'clickNum', 'click_num', 'uv'],
      Math.max(1, core.orderCount * 3)
    )
  );
  const refundCount = Math.round(
    rowNumber(row, ['refundCount', 'refund_count', 'refundNum', 'refund_num'], 0)
  );
  const verifyCount = Math.round(
    rowNumber(
      row,
      ['verifyCount', 'verify_count', 'verifyNum', 'verify_num', 'usedCount', 'used_count'],
      0
    )
  );
  const gmv = rowMoney(
    row,
    ['gmv', 'paidAmount', 'paid_amount', 'salesAmount', 'sales_amount'],
    ['paidAmountCents', 'paid_amount_cents'],
    core.paidOrderCount * core.resolvedSalePrice
  );
  const refundAmount = rowMoney(
    row,
    ['refundAmount', 'refund_amount'],
    ['refundAmountCents', 'refund_amount_cents'],
    refundCount * core.resolvedSalePrice
  );
  const startTime = rowDateText(
    row,
    [
      'startTime',
      'start_time',
      'startDate',
      'start_date',
      'beginTime',
      'begin_time',
      'createDate',
      'createdAt'
    ],
    now
  );
  const endTime = rowDateText(
    row,
    [
      'endTime',
      'end_time',
      'expireDate',
      'expire_date',
      'finishTime',
      'finish_time',
      'expireTime',
      'expire_time'
    ],
    futureISO(MS_PER_DAY * 7)
  );
  const rating = rowNumber(row, ['rating', 'score', 'merchantScore', 'merchant_score'], 4.6);

  return {
    useRules,
    sellingPoints,
    exposureCount,
    clickCount,
    refundCount,
    verifyCount,
    gmv,
    refundAmount,
    soldCount: clampNonNegative(core.stockTotal - core.stockLeft),
    startTime,
    endTime,
    scoreSeed: rating > 5 ? rating : rating * 18,
    bargainType: Math.round(
      rowNumber(row, ['bargainType', 'bargain_type', 'commodityType', 'commodity_type'], 1)
    ),
    commissionRate: normalizeRatio(
      rowNumber(row, ['commissionRate', 'commission_rate', 'ratio'], 12)
    )
  };
}
