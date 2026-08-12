import { describe, expect, it } from 'vitest';
import { validateSync } from 'class-validator';
import { WelfarePointQueryDto } from '../src/welfare-point/welfare-point.dto';

function validate(partial: Record<string, unknown>) {
  const dto = new WelfarePointQueryDto();
  Object.assign(dto, partial);
  return validateSync(dto);
}

describe('WelfarePointQueryDto', () => {
  it('accepts a well-formed query', () => {
    const errs = validate({
      page: 2,
      pageSize: 50,
      phone: '178',
      pointType: '1',
      sourceType: '5',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-10',
      keyword: '积分',
      reload: true
    });
    expect(errs).toHaveLength(0);
  });

  it('rejects a non YYYY-MM-DD dateFrom', () => {
    const errs = validate({ dateFrom: '2026/08/01' });
    expect(errs.some((e) => e.property === 'dateFrom')).toBe(true);
  });

  it('rejects a non YYYY-MM-DD dateTo', () => {
    const errs = validate({ dateTo: '08-10-2026' });
    expect(errs.some((e) => e.property === 'dateTo')).toBe(true);
  });

  it('rejects pointType outside the allowed set', () => {
    const errs = validate({ pointType: '9' });
    expect(errs.some((e) => e.property === 'pointType')).toBe(true);
  });

  it('rejects pageSize above the 200 cap', () => {
    const errs = validate({ pageSize: 300 });
    expect(errs.some((e) => e.property === 'pageSize')).toBe(true);
  });
});
