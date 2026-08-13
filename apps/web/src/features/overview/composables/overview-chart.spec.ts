import { describe, expect, it } from 'vitest';
import { buildOverviewTrendOption } from './overview-chart';

describe('overview trend chart money conversion', () => {
  it('renders fen-only API values as yuan with decimals', () => {
    const option = buildOverviewTrendOption([
      { date: '2026-08-11', gmvFen: '2493162', paidOrderCount: 12 }
    ]) as {
      yAxis?: Array<{ name?: string }>;
      series?: Array<{ name?: string; data?: number[] }>;
    };

    expect(option.series?.[0]?.data).toEqual([24931.62]);
    expect(option.yAxis?.[0]?.name).toBe('净 GMV');
    expect(option.series?.[0]?.name).toBe('净 GMV');
  });
});
