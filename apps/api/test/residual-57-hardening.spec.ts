import { describe, expect, it } from 'vitest';

describe('residual #57 response body leftovers', () => {
  it('gmv-refresh + auto-login use readResponseText (no bare response.text)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const files = ['gmv/gmv-refresh-page.ts', 'content/auto-login-client.ts'];
    for (const rel of files) {
      const src = await fs.readFile(path.join(__dirname, '..', 'src', rel), 'utf8');
      expect(src, rel).toContain('readResponseText');
      expect(src, rel).not.toMatch(/await\s+\w+\.text\(\)/);
    }
  });
});

describe('residual #57 list payload shrink', () => {
  it('exports COPY_LIST_SELECT without body/cta + PERF_LIST_SELECT', async () => {
    const mod = await import('../src/content/mappers');
    expect(mod.COPY_LIST_SELECT).toBeDefined();
    expect(mod.COPY_LIST_SELECT).not.toHaveProperty('body');
    expect(mod.COPY_LIST_SELECT).not.toHaveProperty('cta');
    expect(mod.COPY_LIST_SELECT).toHaveProperty('title');
    expect(mod.COPY_LIST_SELECT).toHaveProperty('contentId');
    expect(mod.PERF_LIST_SELECT).toBeDefined();
    expect(mod.PERF_LIST_SELECT).toHaveProperty('exposureCount');
    expect(mod.PERF_LIST_SELECT).not.toHaveProperty('taskId');
  });

  it('listCopies uses COPY_LIST_SELECT; getCopy returns full row', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'copy-query.service.ts'),
      'utf8'
    );
    expect(src).toContain('COPY_LIST_SELECT');
    expect(src).toMatch(/async getCopy\(/);
    expect(src).toMatch(/select:\s*COPY_LIST_SELECT/);
  });

  it('copy controller exposes GET copies/:contentId', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'copy.controller.ts'),
      'utf8'
    );
    expect(src).toContain("Get('copies/:contentId')");
    expect(src).toContain('getCopy');
  });

  it('dashboard getPerformance uses PERF_LIST_SELECT', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'dashboard-performance-read.ts'),
      'utf8'
    );
    expect(src).toContain('PERF_LIST_SELECT');
    // residual #83: computePerformance routes through loadDashboardPerfAndCopies
    // which binds PERF_LIST_SELECT via perfSelect (then select: opts.perfSelect).
    expect(src).toMatch(/perfSelect:\s*PERF_LIST_SELECT/);
    expect(src).toContain('loadDashboardPerfAndCopies');
  });

  it('rule list omits payload via RULE_CONFIG_LIST_SELECT', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const support = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'rule-config-support.ts'),
      'utf8'
    );
    const ops = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'rule-config-read.ts'),
      'utf8'
    );
    expect(support).toContain('RULE_CONFIG_LIST_SELECT');
    expect(support).toMatch(/RULE_CONFIG_LIST_SELECT[\s\S]*?id:\s*true/);
    expect(support).not.toMatch(/RULE_CONFIG_LIST_SELECT[\s\S]*?payload:\s*true/);
    expect(ops).toContain('RULE_CONFIG_LIST_SELECT');
    expect(ops).toMatch(/select:\s*RULE_CONFIG_LIST_SELECT/);
  });
});

describe('residual #57 single-flight + indexes', () => {
  it('merchant refreshAddresses + data-analysis export single-flight', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const merchant = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant.service.ts'),
      'utf8'
    );
    const analysis = await fs.readFile(
      path.join(__dirname, '..', 'src', 'data-analysis', 'data-analysis.service.ts'),
      'utf8'
    );
    expect(merchant).toContain('refreshAddressesRunning');
    expect(merchant).toContain('skippedInFlight');
    expect(analysis).toContain('exportRunning');
    expect(analysis).toContain('ConflictException');
  });

  it('migration creates residual #57 compound indexes (VNext DB-003: no runtime DDL)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const sql = await fs.readFile(
      path.join(__dirname, '..', '..', '..', 'prisma', 'migrations', '0001_init', 'migration.sql'),
      'utf8'
    );
    expect(sql).toContain('GeneratedCopy_auditStatus_channel_createdAt_idx');
    expect(sql).toContain('DistributionTask_status_updatedAt_idx');
  });

  it('schema declares compound indexes for GeneratedCopy + DistributionTask', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const schema = await fs.readFile(
      path.join(__dirname, '..', '..', '..', 'prisma', 'schema.prisma'),
      'utf8'
    );
    expect(schema).toMatch(/@@index\(\[auditStatus, channel, createdAt\]\)/);
    expect(schema).toMatch(/@@index\(\[status, updatedAt\]\)/);
  });
});
