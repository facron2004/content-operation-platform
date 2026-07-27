import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  optionalDateKey,
  optionalIsoDateTime,
  requiredDateKey
} from '../src/content/dto-decorators';

class SampleOptional {
  @optionalDateKey()
  date?: string;
}

class SampleRequired {
  @requiredDateKey()
  date!: string;
}

class SampleIso {
  @optionalIsoDateTime()
  plannedAt?: string;
}

describe('optionalDateKey / requiredDateKey', () => {
  it('accepts YYYY-MM-DD', () => {
    const dto = plainToInstance(SampleOptional, { date: '2026-07-16' });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects free-form strings that only MaxLength would allow', () => {
    const dto = plainToInstance(SampleOptional, { date: 'tomorrow' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('rejects ISO timestamps (must be date key only)', () => {
    const dto = plainToInstance(SampleOptional, { date: '2026-07-16T00:00:00Z' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('allows missing optional date', () => {
    const dto = plainToInstance(SampleOptional, {});
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('requires requiredDateKey', () => {
    const empty = plainToInstance(SampleRequired, {});
    expect(validateSync(empty).length).toBeGreaterThan(0);
    const ok = plainToInstance(SampleRequired, { date: '2026-01-01' });
    expect(validateSync(ok)).toHaveLength(0);
  });
});

describe('optionalIsoDateTime', () => {
  it('accepts ISO timestamps and bare date keys', () => {
    for (const plannedAt of [
      '2026-07-16',
      '2026-07-16T12:00:00Z',
      '2026-07-16T12:00:00.000Z',
      '2026-07-16T12:00:00+08:00',
      '2026-07-16 12:00:00'
    ]) {
      const dto = plainToInstance(SampleIso, { plannedAt });
      expect(validateSync(dto), plannedAt).toHaveLength(0);
    }
  });

  it('rejects free-form labels', () => {
    const dto = plainToInstance(SampleIso, { plannedAt: 'tomorrow morning' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('allows missing optional plannedAt', () => {
    const dto = plainToInstance(SampleIso, {});
    expect(validateSync(dto)).toHaveLength(0);
  });
});
