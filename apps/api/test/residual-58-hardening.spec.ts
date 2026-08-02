import { describe, expect, it } from 'vitest';

describe('residual #58 audit list payload shrink', () => {
  it('list SELECT omits before/after; detail keeps full row columns', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'audit-log', 'audit-log.service.ts'),
      'utf8'
    );
    expect(src).toContain('AUDIT_LOG_LIST_COLUMNS');
    expect(src).toContain('AUDIT_LOG_ROW_COLUMNS');
    // List path uses list columns (no before/after materialization).
    expect(src).toMatch(/SELECT \$\{AUDIT_LOG_LIST_COLUMNS\} FROM "OperationAuditLog"/);
    // Detail path keeps full row with before/after.
    expect(src).toMatch(
      /SELECT \$\{AUDIT_LOG_ROW_COLUMNS\} FROM "OperationAuditLog" WHERE "logId"/
    );
    // LIST columns definition must not include before/after tokens as selected fields.
    const listDef = src.match(/const AUDIT_LOG_LIST_COLUMNS = `([\s\S]*?)`;/)?.[1];
    expect(listDef).toBeTruthy();
    expect(listDef).not.toMatch(/"before"/);
    expect(listDef).not.toMatch(/"after"/);
    const rowDef = src.match(/const AUDIT_LOG_ROW_COLUMNS = `([\s\S]*?)`;/)?.[1];
    expect(rowDef).toMatch(/"before"/);
    expect(rowDef).toMatch(/"after"/);
  });

  it('audit interceptor omits bodies on heavy admin export/refresh paths', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'audit-log', 'audit-log.interceptor.ts'),
      'utf8'
    );
    expect(src).toContain("path.includes('/export')");
    expect(src).toContain("path.includes('/gmv/refresh')");
    expect(src).toContain("path.includes('/merchant-sales/refresh')");
    expect(src).toContain("path.includes('/attribution/recompute')");
  });
});

describe('residual #58 single-flight exports + summary cache', () => {
  it('merchant-sales export single-flight with ConflictException', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant-sales', 'merchant-sales-surface.ts'),
      'utf8'
    );
    expect(src).toContain('exportRunning');
    expect(src).toContain('ConflictException');
    expect(src).toContain('商家销售导出进行中');
  });

  it('zero-sales export single-flight via listSkusForExport', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const svc = await fs.readFile(
      path.join(__dirname, '..', 'src', 'zero-sales', 'zero-sales.service.ts'),
      'utf8'
    );
    const ctl = await fs.readFile(
      path.join(__dirname, '..', 'src', 'zero-sales', 'zero-sales.controller.ts'),
      'utf8'
    );
    expect(svc).toContain('exportRunning');
    expect(svc).toContain('listSkusForExport');
    expect(svc).toContain('ConflictException');
    expect(ctl).toContain('listSkusForExport');
  });

  it('data-analysis summary uses TtlCache getOrLoad', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'data-analysis', 'data-analysis.service.ts'),
      'utf8'
    );
    expect(src).toContain('summaryCache');
    expect(src).toContain('TtlCache');
    expect(src).toMatch(/summaryCache\.getOrLoad/);
    expect(src).toContain('buildSummary');
  });
});

describe('residual #58 force stampede + bare t=', () => {
  it('TtlCache force path does not drop inFlight', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'common', 'ttl-cache.ts'),
      'utf8'
    );
    // Force must not call inFlight.delete(key) before coalescing.
    expect(src).not.toMatch(/else\s*\{\s*this\.delete\(key\);\s*this\.inFlight\.delete\(key\);/);
    expect(src).toMatch(/const pending = this\.inFlight\.get\(key\)/);
  });

  it('hasForceSignal ignores bare t= cache buster', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'common', 'force-signal.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/q\['t'\]\s*!=\s*null/);
    expect(src).toContain("q['_'] != null || q['_t'] != null");
  });
});

describe('residual #58 select hygiene', () => {
  it('GMV + refund DailyMetrics trends use explicit select', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const gmv = await fs.readFile(
      path.join(__dirname, '..', 'src', 'gmv', 'gmv-resolve.ts'),
      'utf8'
    );
    const refund = await fs.readFile(
      path.join(__dirname, '..', 'src', 'refund', 'refund-daily-metrics.ts'),
      'utf8'
    );
    expect(gmv).toMatch(/dailyMetrics\.findMany\(\{[\s\S]*?select:\s*\{/);
    expect(gmv).toContain('gmvBonusFen: true');
    expect(refund).toMatch(/refundTrendFromDailyMetrics[\s\S]*?select:\s*\{/);
    expect(refund).toMatch(/verifyTrendFromDailyMetrics[\s\S]*?select:\s*\{/);
  });

  it('task list SELECT drops trackingCode + idempotencyKey', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task-query.ts'),
      'utf8'
    );
    const listSelect = src.match(/const TASK_LIST_SELECT = `([\s\S]*?)`;/)?.[1];
    const listRow = src.match(/export const TASK_LIST_ROW_COLUMNS = `([\s\S]*?)`;/)?.[1];
    expect(listSelect).toBeTruthy();
    expect(listRow).toBeTruthy();
    expect(listSelect).not.toMatch(/trackingCode/);
    expect(listSelect).not.toMatch(/idempotencyKey/);
    expect(listRow).not.toMatch(/trackingCode/);
    expect(listRow).not.toMatch(/idempotencyKey/);
    // Detail path still has trackingCode (role-gated); Residual #177 drops idempotencyKey.
    expect(src).toMatch(/TASK_ROW_COLUMNS[\s\S]*trackingCode/);
    expect(src).not.toMatch(/TASK_ROW_COLUMNS[\s\S]*idempotencyKey/);
  });

  it('PERF_LIST_SELECT omits leaderId', async () => {
    const mod = await import('../src/content/mappers');
    expect(mod.PERF_LIST_SELECT).toBeDefined();
    expect(mod.PERF_LIST_SELECT).not.toHaveProperty('leaderId');
    expect(mod.PERF_LIST_SELECT).toHaveProperty('exposureCount');
  });

  it('rule prune uses skip/take instead of loading all inactive versions', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'rule-config-ops.ts'),
      'utf8'
    );
    expect(src).toMatch(/skip:\s*keep/);
    expect(src).toMatch(/take:\s*PRUNE_BATCH/);
  });
});

describe('residual #58 compound indexes', () => {
  it('schema declares residual #58 compound indexes', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const schema = await fs.readFile(
      path.join(__dirname, '..', '..', '..', 'prisma', 'schema.prisma'),
      'utf8'
    );
    expect(schema).toMatch(/@@index\(\[date, salesQty\]\)/);
    expect(schema).toMatch(/@@index\(\[packageId, salesQty, date\]\)/);
    expect(schema).toMatch(/@@index\(\[status, plannedAt\]\)/);
    expect(schema).toMatch(/@@index\(\[groupId, createdAt\]\)/);
    expect(schema).toMatch(/@@index\(\[packageId, createdAt\]\)/);
    expect(schema).toMatch(/@@index\(\[userId, createdAt\]\)/);
    expect(schema).toMatch(/@@index\(\[objectType, createdAt\]\)/);
  });

  it('migration creates residual #58 indexes (VNext DB-003: no runtime DDL)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const sql = await fs.readFile(
      path.join(__dirname, '..', '..', '..', 'prisma', 'migrations', '0001_init', 'migration.sql'),
      'utf8'
    );
    expect(sql).toContain('PackageSalesDaily_date_salesQty_idx');
    expect(sql).toContain('DistributionTask_status_plannedAt_idx');
    expect(sql).toContain('DistributionTask_groupId_createdAt_idx');
    expect(sql).toContain('CopyPerformance_packageId_createdAt_idx');
    expect(sql).toContain('OperationAuditLog_userId_createdAt_idx');
  });
});
