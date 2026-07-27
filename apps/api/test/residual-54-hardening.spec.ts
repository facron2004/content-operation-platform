import { describe, expect, it } from 'vitest';
import {
  CSV_EXPORT_MAX_ROWS,
  GMV_TOP_MERCHANTS_LIMIT,
  LIST_PAGE_MAX
} from '../src/common/sql-chunk';

describe('residual #54 hardening hygiene', () => {
  it('merchant-sales export binds CSV_EXPORT_MAX_ROWS', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant-sales', 'merchant-sales-query.ts'),
      'utf8'
    );
    expect(src).toContain('CSV_EXPORT_MAX_ROWS');
    expect(src).toMatch(/LIMIT \?/);
    expect(src).not.toMatch(/LIMIT 1000/);
    expect(CSV_EXPORT_MAX_ROWS).toBe(1_000);
  });

  it('GMV top-merchants SQL pushes ORDER BY + LIMIT', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'gmv', 'gmv-resolve.ts'),
      'utf8'
    );
    expect(src).toContain('GMV_TOP_MERCHANTS_LIMIT');
    expect(src).toMatch(/ORDER BY "gmv" DESC/);
    expect(src).toMatch(/LIMIT \?/);
    expect(GMV_TOP_MERCHANTS_LIMIT).toBe(1_000);
  });

  it('merchant trend reads MerchantDailyMetrics not SalesSnapshot', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant-trend.ts'),
      'utf8'
    );
    expect(src).toContain('MerchantDailyMetrics');
    // Live FROM must not hit SalesSnapshot (comment may still mention the dead path).
    expect(src).not.toMatch(/FROM\s+"SalesSnapshot"/i);
    expect(src).toMatch(/FROM\s+"MerchantDailyMetrics"/);
  });

  it('daily inventory crawl has single-flight running guard', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'daily-inventory-crawler.service.ts'),
      'utf8'
    );
    expect(src).toMatch(/private running = false/);
    expect(src).toContain('previous run still in flight');
  });

  it('findTaskRow uses explicit columns; parseTask defaults trackingCode off', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task-query.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/SELECT \* FROM "DistributionTask"/);
    expect(src).toContain('TASK_ROW_COLUMNS');
    expect(src).toMatch(/includeTrackingCode === true/);
  });

  it('attribution recompute binds named fan-out limits', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'attribution', 'attribution.service.ts'),
      'utf8'
    );
    expect(src).toContain('ATTRIBUTION_VISIT_FANOUT_LIMIT');
    expect(src).toContain('ATTRIBUTION_ORDER_DIRECT_LIMIT');
    expect(src).toContain('ATTRIBUTION_ORDER_WINDOW_LIMIT');
    expect(src).not.toMatch(/LIMIT 2000/);
    expect(src).not.toMatch(/LIMIT 200`/);
    expect(src).not.toMatch(/LIMIT 500`/);
  });

  it('rule-config create prunes inactive history beyond keep-N', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'rule-config-ops.ts'),
      'utf8'
    );
    expect(src).toContain('RULE_CONFIG_INACTIVE_KEEP');
    expect(src).toContain('pruneInactiveRuleVersions');
  });

  it('list DTOs cap page (LIST_PAGE_MAX family; interactive tightened to 100)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    // residual #76: interactive CRUD lists use Max(100); ZS skus Max(20).
    // Constant LIST_PAGE_MAX remains 500 as the shared clamp ceiling.
    const interactive = [
      'distribution-task/dto/task-query.dto.ts',
      'campaign/dto/campaign-query.dto.ts',
      'community/dto/community-query.dto.ts',
      'merchant/merchant.dto.ts'
    ];
    for (const rel of interactive) {
      const src = await fs.readFile(path.join(__dirname, '..', 'src', rel), 'utf8');
      expect(src, rel).toMatch(/@Max\(100\)/);
    }
    const zs = await fs.readFile(
      path.join(__dirname, '..', 'src', 'zero-sales', 'zero-sales.dto.ts'),
      'utf8'
    );
    // residual #81: ZS merchants page Max tightened to 100; SKUs Max(20) head window.
    expect(zs).toMatch(/@Max\(100\)/);
    expect(zs).toMatch(/@Max\(20\)/);
    const attr = await fs.readFile(
      path.join(__dirname, '..', 'src', 'attribution', 'attribution.controller.ts'),
      'utf8'
    );
    // residual #80: unmatched-orders page Max tightened to 100 (interactive CRUD parity).
    expect(attr).toMatch(/@Max\(100\)/);
    expect(LIST_PAGE_MAX).toBe(500);
  });

  it('jobs module wires CopyPerformanceRetentionJob', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'jobs', 'jobs.module.ts'),
      'utf8'
    );
    expect(src).toContain('CopyPerformanceRetentionJob');
  });
});
