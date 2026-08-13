import { describe, expect, it } from 'vitest';
import type { ArgumentMetadata } from '@nestjs/common';
import {
  DATA_ANALYSIS_DETAIL_MAX_ROWS,
  DATA_ANALYSIS_RANKING_MAX_ROWS
} from '../src/common/sql-chunk';
import { createDtoPipe } from '../src/common/dto-pipe';
import { DataAnalysisQueryDto } from '../src/data-analysis/data-analysis.dto';

describe('data-analysis export row caps (residual #52)', () => {
  it('exports named ceilings tighter than legacy 5k', () => {
    expect(DATA_ANALYSIS_DETAIL_MAX_ROWS).toBe(2_000);
    expect(DATA_ANALYSIS_RANKING_MAX_ROWS).toBe(1_000);
    expect(DATA_ANALYSIS_DETAIL_MAX_ROWS).toBeLessThan(5_000);
    expect(DATA_ANALYSIS_RANKING_MAX_ROWS).toBeLessThan(5_000);
  });

  it('DTO pipe accepts named ceilings and rejects values above them', async () => {
    const pipe = createDtoPipe(DataAnalysisQueryDto);
    const metadata: ArgumentMetadata = { type: 'query', metatype: DataAnalysisQueryDto };

    await expect(
      pipe.transform(
        {
          detailLimit: DATA_ANALYSIS_DETAIL_MAX_ROWS,
          rankingLimit: DATA_ANALYSIS_RANKING_MAX_ROWS,
          force: 'true'
        },
        metadata
      )
    ).resolves.toMatchObject({
      detailLimit: DATA_ANALYSIS_DETAIL_MAX_ROWS,
      rankingLimit: DATA_ANALYSIS_RANKING_MAX_ROWS,
      force: 'true'
    });

    await expect(
      pipe.transform({ detailLimit: DATA_ANALYSIS_DETAIL_MAX_ROWS + 1 }, metadata)
    ).rejects.toThrow();
    await expect(
      pipe.transform({ rankingLimit: DATA_ANALYSIS_RANKING_MAX_ROWS + 1 }, metadata)
    ).rejects.toThrow();
  });
});
