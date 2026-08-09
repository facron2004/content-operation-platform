import { describe, expect, it } from 'vitest';
import type { ArgumentMetadata } from '@nestjs/common';
import { createDtoPipe } from '../src/common/dto-pipe';
import {
  GmvByMerchantQueryDto,
  GmvDistributionQueryDto,
  GmvHourlyQueryDto,
  GmvTodayQueryDto,
  GmvTrendQueryDto
} from '../src/gmv/gmv.dto';

const CACHE_CONTROL_QUERY = { _: '1785851961825', force: 'true' };
const PIPE_METADATA = {} as ArgumentMetadata;

describe('GMV query DTO cache-control parameters', () => {
  it('accepts the force/cache-buster query used by the GMV cockpit', async () => {
    const cases = [
      [GmvTodayQueryDto, { date: '2026-08-04', ...CACHE_CONTROL_QUERY }],
      [
        GmvTrendQueryDto,
        { days: '30', granularity: 'day', endDate: '2026-08-04', ...CACHE_CONTROL_QUERY }
      ],
      [GmvHourlyQueryDto, { date: '2026-08-04', ...CACHE_CONTROL_QUERY }],
      [GmvDistributionQueryDto, { dim: 'area', limit: '20', ...CACHE_CONTROL_QUERY }],
      [
        GmvByMerchantQueryDto,
        { sortBy: 'gmvDesc', page: '1', pageSize: '20', ...CACHE_CONTROL_QUERY }
      ]
    ] as const;

    for (const [DtoClass, query] of cases) {
      await expect(createDtoPipe(DtoClass).transform(query, PIPE_METADATA)).resolves.toMatchObject(
        CACHE_CONTROL_QUERY
      );
    }
  });

  it('continues to reject undeclared business query parameters', async () => {
    await expect(
      createDtoPipe(GmvTodayQueryDto).transform(
        {
          ...CACHE_CONTROL_QUERY,
          unexpected: 'value'
        },
        PIPE_METADATA
      )
    ).rejects.toThrow('Validation failed');
  });
});
