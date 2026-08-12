import { describe, expect, it } from 'vitest';
import {
  normalizeWelfarePointList,
  parseJeeSiteDate,
  type WelfarePointRaw
} from '../src/welfare-point/welfare-point.adapter';
import { POINT_SOURCE_LABELS, sourceTypeLabel } from '../src/welfare-point/welfare-point.types';

function raw(overrides: Partial<WelfarePointRaw>): WelfarePointRaw {
  return {
    id: '1',
    centerMemberId: 'm1',
    pointAmount: 10,
    pointType: 1,
    sourceType: 1,
    orderNo: null,
    currentBalance: 10,
    expireTime: null,
    changeDesc: 'x',
    status: '0',
    createDate: '2026-08-10 13:35:08',
    updateDate: '2026-08-10 13:35:08',
    centerMember: { phone: '178****7020', nickName: '张三', code: '123456' },
    ...overrides
  };
}

describe('welfare-point adapter', () => {
  describe('parseJeeSiteDate', () => {
    it('turns a YYYY-MM-DD HH:mm:ss string into epoch ms', () => {
      const ts = parseJeeSiteDate('2026-08-10 13:35:08');
      expect(ts).toBe(Date.parse('2026-08-10T13:35:08Z'));
    });

    it('returns 0 for empty input', () => {
      expect(parseJeeSiteDate('')).toBe(0);
      expect(parseJeeDate(undefined)).toBe(0);
    });
  });

  describe('normalizeWelfarePointRecord', () => {
    it('maps raw fields and labels pointType/sourceType', () => {
      const [r] = normalizeWelfarePointList([raw({})]);
      expect(r.memberPhone).toBe('178****7020');
      expect(r.memberName).toBe('张三');
      expect(r.memberCode).toBe('123456');
      expect(r.pointTypeLabel).toBe('充值');
      expect(r.createDateTs).toBe(Date.parse('2026-08-10T13:35:08Z'));
    });

    it('normalizes an unknown sourceType via the fallback helper', () => {
      expect(sourceTypeLabel(5)).toBe(POINT_SOURCE_LABELS[5]);
      expect(sourceTypeLabel(999)).toBe('其他(999)');
    });

    it('treats pointType 2 as 消费', () => {
      const [r] = normalizeWelfarePointList([raw({ pointType: 2 })]);
      expect(r.pointType).toBe(2);
      expect(r.pointTypeLabel).toBe('消费');
    });
  });

  describe('normalizeWelfarePointList', () => {
    it('handles a null/undefined raw member gracefully', () => {
      const [r] = normalizeWelfarePointList([raw({ centerMember: null })]);
      expect(r.memberPhone).toBe('');
      expect(r.memberName).toBe('');
      expect(r.memberCode).toBe('');
    });
  });
});

// local alias so the intent reads clearly without a second import line
function parseJeeDate(v: string | null | undefined) {
  return parseJeeSiteDate(v);
}
