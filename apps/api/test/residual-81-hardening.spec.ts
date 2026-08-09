import { describe, expect, it } from 'vitest';

describe('residual #81 single-day exclusive visitTime/attributedAt bounds', () => {
  it('performance-aggregation job uses exclusive day bounds not sqlBeijingDate equality', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    // residual #87 extracted bulk TPD SQL into task-performance-daily.ts;
    // job itself only calls bulkRefreshTaskPerformanceDaily.
    const jobSrc = await fs.readFile(
      path.join(__dirname, '..', 'src', 'jobs', 'performance-aggregation.job.ts'),
      'utf8'
    );
    expect(jobSrc).toContain('bulkRefreshTaskPerformanceDaily');
    expect(jobSrc).not.toContain('sqlBeijingDate');

    const helperSrc = await fs.readFile(
      path.join(__dirname, '..', 'src', 'common', 'task-performance-daily.ts'),
      'utf8'
    );
    expect(helperSrc).toContain('sqlDatetimeExclusiveRange');
    expect(helperSrc).toContain('beijingDayRangeSqlite');
    expect(helperSrc).toContain('sqlDatetimeExclusiveRange(\'"visitTime"\')');
    expect(helperSrc).toContain('sqlDatetimeExclusiveRange(\'oa."attributedAt"\')');
    // No day-equality filters left on free-form timestamps.
    expect(helperSrc).not.toMatch(/sqlBeijingDate\([^)]+\)\} = \?/);
    expect(helperSrc).not.toContain('sqlBeijingDate');
  });

  it('attribution TPD refresh uses exclusive day bounds via shared helper', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    // residual #92/#102: TPD refresh goes through refreshTpdByTaskDays
    // → bulkRefreshTaskPerformanceDaily (bounds live in task-performance-daily.ts).
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'attribution', 'attribution.service.ts'),
      'utf8'
    );
    expect(src).toContain('refreshTpdByTaskDays');
    expect(src).toContain('bulkRefreshTaskPerformanceDaily');
    expect(src).not.toMatch(/private\s+async\s+updatePerformance\s*\(/);

    const helperSrc = await fs.readFile(
      path.join(__dirname, '..', 'src', 'common', 'task-performance-daily.ts'),
      'utf8'
    );
    expect(helperSrc).toContain('sqlDatetimeExclusiveRange');
    expect(helperSrc).toContain('beijingDayRangeSqlite');
    expect(helperSrc).toContain('sqlDatetimeExclusiveRange(\'"visitTime"\')');
    expect(helperSrc).toContain('sqlDatetimeExclusiveRange(\'oa."attributedAt"\')');
    expect(helperSrc).not.toMatch(/sqlBeijingDate\([^)]+\)\} = \?/);
  });
});

describe('residual #81 movement + zero-sales page Max 100', () => {
  it('movement/ZS list DTOs cap page at 100 (was 500)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const files = [
      ['movement', 'movement.dto.ts'],
      ['zero-sales', 'zero-sales.dto.ts']
    ];
    for (const parts of files) {
      const src = await fs.readFile(path.join(__dirname, '..', 'src', ...parts), 'utf8');
      expect(src, parts.join('/')).toMatch(/@Max\(100\)[\s\S]{0,80}page/);
      expect(src, parts.join('/')).not.toMatch(/@Max\(500\)/);
    }
  });

  it('movement/ZS services clamp page with max 100 defense-in-depth', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const files = [
      path.join(__dirname, '..', 'src', 'movement', 'movement.controller.ts'),
      path.join(__dirname, '..', 'src', 'movement', 'movement-sku-projection.ts'),
      path.join(__dirname, '..', 'src', 'zero-sales', 'zero-sales-list.ts')
    ];
    for (const f of files) {
      const src = await fs.readFile(f, 'utf8');
      expect(src, f).toMatch(/clampListPage\([^)]+,\s*100\)/);
    }
  });
});
