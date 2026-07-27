import { describe, expect, it } from 'vitest';
import {
  batchUpsertTaskPerformanceDaily,
  buildTpdRowsForDay,
  TPD_UPSERT_CHUNK,
  type TpdUpsertRow
} from '../src/common/task-performance-daily';

describe('residual #87 TPD multi-row upsert helpers', () => {
  it('batchUpsertTaskPerformanceDaily chunks multi-row INSERT…ON CONFLICT', async () => {
    const sqls: string[] = [];
    const paramLens: number[] = [];
    const prisma = {
      $executeRawUnsafe: async (sql: string, ...params: unknown[]) => {
        sqls.push(sql);
        paramLens.push(params.length);
        return 1;
      }
    };

    const rows: TpdUpsertRow[] = Array.from({ length: TPD_UPSERT_CHUNK + 3 }, (_, i) => ({
      taskId: `t${i}`,
      date: '2026-07-24',
      visitCount: i,
      orderCount: 0,
      gmv: 0,
      verifyCount: 0,
      refundCount: 0,
      conversionRate: 0
    }));

    const n = await batchUpsertTaskPerformanceDaily(prisma, rows, '2026-07-24 00:00:00');
    expect(n).toBe(rows.length);
    // First full chunk + remainder.
    expect(sqls.length).toBe(2);
    for (const sql of sqls) {
      expect(sql).toContain('INSERT INTO "TaskPerformanceDaily"');
      expect(sql).toContain('ON CONFLICT("taskId", "date") DO UPDATE');
    }
    // Multi-row: first chunk has 49 tuple separators; remainder has 2.
    expect((sqls[0].match(/\),\(/g) ?? []).length).toBe(TPD_UPSERT_CHUNK - 1);
    expect((sqls[1].match(/\),\(/g) ?? []).length).toBe(2);
    // 50 rows × 11 cols (10 + gmvFen dual-write, PRD §7.4 Phase 3), then 3 × 11.
    expect(paramLens[0]).toBe(TPD_UPSERT_CHUNK * 11);
    expect(paramLens[1]).toBe(3 * 11);
  });

  it('buildTpdRowsForDay derives conversionRate and zero-fills missing maps', () => {
    const visit = new Map([['code-a', 10]]);
    const attr = new Map([
      ['task-a', { taskId: 'task-a', orderCount: 2, gmv: 100, verifyCount: 1, refundCount: 0 }]
    ]);
    const rows = buildTpdRowsForDay(
      [
        { taskId: 'task-a', trackingCode: 'code-a' },
        { taskId: 'task-b', trackingCode: null },
        { taskId: 'task-c', trackingCode: 'missing' }
      ],
      '2026-07-24',
      visit,
      attr
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      taskId: 'task-a',
      visitCount: 10,
      orderCount: 2,
      gmv: 100,
      conversionRate: 0.2
    });
    expect(rows[1]).toMatchObject({
      taskId: 'task-b',
      visitCount: 0,
      orderCount: 0,
      conversionRate: 0
    });
    expect(rows[2]).toMatchObject({
      taskId: 'task-c',
      visitCount: 0,
      orderCount: 0
    });
  });
});

describe('residual #87 performance job + attribution recompute bulk TPD', () => {
  it('performance-aggregation uses bulkRefreshTaskPerformanceDaily (no N serial upsert)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'jobs', 'performance-aggregation.job.ts'),
      'utf8'
    );
    expect(src).toContain('bulkRefreshTaskPerformanceDaily');
    // No per-task INSERT loop left in the cron body.
    expect(src).not.toMatch(/for\s*\(\s*const\s+task\s+of\s+tasks\s*\)/);
    expect(src).not.toContain('INSERT INTO "TaskPerformanceDaily"');
  });

  it('attribution recompute bulk-refreshes today TPD after tier loop', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'attribution', 'attribution.service.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('private async runRecompute');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  private async purgePackageMismatched', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);
    expect(fn).toContain('bulkRefreshTaskPerformanceDaily');
    // No per-task updatePerformance inside the recompute loop.
    expect(fn).not.toMatch(/await\s+this\.updatePerformance\s*\(/);
  });

  it('package-mismatch purge bulk-refreshes TPD by day', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'attribution', 'attribution.service.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('private async purgePackageMismatchedAttributions');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  /** Tier 1:', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);
    expect(fn).toContain('bulkRefreshTaskPerformanceDaily');
    expect(fn).not.toMatch(/await\s+this\.updatePerformance\s*\(/);
  });
});
