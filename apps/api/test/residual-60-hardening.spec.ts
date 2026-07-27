import { describe, expect, it } from 'vitest';
import {
  AI_COPY_CONCURRENCY_MAX,
  AI_COPY_WAIT_QUEUE_MAX,
  DEFAULT_IN_CHUNK,
  RECOMMEND_SCORE_CAP
} from '../src/common/sql-chunk';

describe('residual #60 ceilings', () => {
  it('exports AI wait-queue cap under concurrency bound', () => {
    expect(AI_COPY_CONCURRENCY_MAX).toBe(2);
    expect(AI_COPY_WAIT_QUEUE_MAX).toBe(8);
    expect(AI_COPY_WAIT_QUEUE_MAX).toBeGreaterThan(AI_COPY_CONCURRENCY_MAX);
    expect(DEFAULT_IN_CHUNK).toBe(500);
    expect(RECOMMEND_SCORE_CAP).toBe(2_000);
  });
});

describe('residual #60 CopyService generate+persist single-flight', () => {
  it('generateCopies coalesces createMany behind process flight', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'copy.service.ts'),
      'utf8'
    );
    expect(src).toContain('generateInFlight');
    expect(src).toContain('doGenerateAndPersist');
    expect(src).toMatch(/generateInFlight\.get\(flightKey\)/);
    expect(src).toMatch(/generateInFlight\.set\(flightKey/);
    // createMany must live inside doGenerateAndPersist, not only AI layer.
    expect(src).toMatch(/doGenerateAndPersist[\s\S]*createMany[\s\S]*contentList:\s*copies/);
  });
});

describe('residual #60 AI waitQueue cap', () => {
  it('acquireSlot rejects when wait queue is full', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'ai-copy', 'ai-copy.service.ts'),
      'utf8'
    );
    expect(src).toContain('AI_COPY_WAIT_QUEUE_MAX');
    expect(src).toMatch(/waitQueue\.length\s*>=\s*waitMax/);
    expect(src).toContain('AI 生成繁忙，请稍后重试');
  });
});

describe('residual #60 dashboard packageId IN chunking', () => {
  it('ops-today and performance load via queryInChunks', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'dashboard.service.ts'),
      'utf8'
    );
    expect(src).toContain('queryInChunks');
    // residual #83: both hot paths share loadDashboardPerfAndCopies which
    // runs two queryInChunks legs under mapPool (CP + GC).
    expect(src).toContain('loadDashboardPerfAndCopies');
    const hits = src.match(/queryInChunks\(packageIds/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
    // Call sites still invoke the helper twice (ops-today + performance).
    const calls = src.match(/loadDashboardPerfAndCopies/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3); // def + 2 call sites
  });
});

describe('residual #60 user list tokenVersion hygiene', () => {
  it('list SELECT omits tokenVersion; auth paths SELECT it explicitly', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'user.service.ts'),
      'utf8'
    );
    expect(src).toContain('USER_LIST_COLUMNS');
    // Residual #169: USER_AUTH_COLUMNS constant removed with mutator slim shells.
    expect(src).not.toContain('USER_AUTH_COLUMNS');
    // List + findById paths use USER_LIST_COLUMNS (Residual #149).
    // 列表查询支持可选 whereSql 过滤（分页重构后），仍必须只投影 USER_LIST_COLUMNS。
    expect(src).toMatch(
      /SELECT \$\{USER_LIST_COLUMNS\} FROM "AppUser" (\$\{whereSql\} )?ORDER BY "createdAt"/
    );
    expect(src).toMatch(/SELECT \$\{USER_LIST_COLUMNS\} FROM "AppUser" WHERE "userId"/);
    // Auth validate / status still project tokenVersion explicitly (not via USER_AUTH).
    expect(src).toMatch(/SELECT "userId", "username", "isActive", "tokenVersion"/);
    // Residual #169: mutators no longer hydrate full auth rows.
    const updateStart = src.indexOf('async update(');
    expect(updateStart).toBeGreaterThan(0);
    const privateStart = src.indexOf('\n  // ─── Private', updateStart);
    const mutators = src.slice(updateStart, privateStart > 0 ? privateStart : updateStart + 8000);
    expect(mutators).not.toMatch(/\bRETURNING\b/);
  });
});

describe('residual #60 DailyMetrics findUnique select hygiene', () => {
  it('GMV / refund / money-day use explicit select', async () => {
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
    const money = await fs.readFile(
      path.join(__dirname, '..', 'src', 'money', 'money-day.ts'),
      'utf8'
    );
    expect(gmv).toContain('kpiSelect');
    expect(gmv).toMatch(
      /findUnique\(\{\s*where:\s*\{\s*date:\s*targetDate\s*\},\s*select:\s*kpiSelect/
    );
    expect(refund).toMatch(/findUnique\(\{[\s\S]*select:\s*\{[\s\S]*totalRefund/);
    expect(refund).toMatch(/findUnique\(\{[\s\S]*select:\s*\{[\s\S]*totalVerify/);
    expect(money).toMatch(
      /findUnique\(\{\s*where:\s*\{\s*date\s*\},\s*select:\s*\{\s*totalGmv:\s*true,\s*paidOrderCount:\s*true/
    );
  });
});

describe('residual #60 RuleConfig active resolve select + index', () => {
  it('findActiveRuleRow selects payload/version only', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const ops = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'rule-config-ops.ts'),
      'utf8'
    );
    const support = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'rule-config-support.ts'),
      'utf8'
    );
    // VNext DB-003: 索引真源改为迁移文件，prisma-connect 不再包含运行时 DDL
    const migration = await fs.readFile(
      path.join(__dirname, '..', '..', '..', 'prisma', 'migrations', '0001_init', 'migration.sql'),
      'utf8'
    );
    expect(support).toContain('RULE_CONFIG_ACTIVE_SELECT');
    expect(ops).toContain('RULE_CONFIG_ACTIVE_SELECT');
    expect(ops).toMatch(/select:\s*RULE_CONFIG_ACTIVE_SELECT/);
    expect(migration).toContain('RuleConfig_merchantId_type_isActive_version_idx');
  });
});
