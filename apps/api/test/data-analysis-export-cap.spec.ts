import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  DATA_ANALYSIS_DETAIL_MAX_ROWS,
  DATA_ANALYSIS_RANKING_MAX_ROWS
} from '../src/common/sql-chunk';

describe('data-analysis export row caps (residual #52)', () => {
  it('exports named ceilings tighter than legacy 5k', () => {
    expect(DATA_ANALYSIS_DETAIL_MAX_ROWS).toBe(2_000);
    expect(DATA_ANALYSIS_RANKING_MAX_ROWS).toBe(1_000);
    expect(DATA_ANALYSIS_DETAIL_MAX_ROWS).toBeLessThan(5_000);
    expect(DATA_ANALYSIS_RANKING_MAX_ROWS).toBeLessThan(5_000);
  });

  it('DTO Max matches service clamp constants', () => {
    const dto = readFileSync(
      join(__dirname, '..', 'src', 'data-analysis', 'data-analysis.dto.ts'),
      'utf8'
    );
    const svc = readFileSync(
      join(__dirname, '..', 'src', 'data-analysis', 'data-analysis.service.ts'),
      'utf8'
    );
    expect(dto).toContain('@Max(2_000)');
    expect(dto).toContain('@Max(1_000)');
    expect(dto).not.toContain('@Max(5_000)');
    expect(dto).not.toContain('@Max(5000)');
    expect(svc).toContain('DATA_ANALYSIS_DETAIL_MAX_ROWS');
    expect(svc).toContain('DATA_ANALYSIS_RANKING_MAX_ROWS');
    // Service must not hardcode the old 5000 ranking ceiling.
    expect(svc).not.toMatch(/Math\.min\(\s*5000\s*,/);
  });
});
