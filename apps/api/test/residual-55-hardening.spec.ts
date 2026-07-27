import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_COPY_PERF_TAKE,
  DASHBOARD_GENERATED_COPY_TAKE,
  EXECUTION_SNAPSHOT_MAX_CHARS,
  EXECUTION_TIMELINE_LIMIT,
  LIST_PAGE_MAX,
  MERCHANT_SKU_LIST_LIMIT,
  RULE_CONFIG_CACHE_MAX,
  clampListPage
} from '../src/common/sql-chunk';
import {
  getRuleCacheEntry,
  setRuleCacheEntry,
  type CacheEntry
} from '../src/content/rule-config-support';

describe('residual #55 hardening hygiene', () => {
  it('service list paths use clampListPage helpers', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const files = [
      'campaign/campaign.service.ts',
      'community/community.service.ts',
      'audit-log/audit-log.service.ts',
      'zero-sales/zero-sales-list.ts',
      'movement/movement-skus.ts',
      'movement/movement.controller.ts',
      'user-access/user.service.ts',
      'attribution/attribution.service.ts',
      'distribution-task/distribution-task-query.ts',
      'merchant/merchant-list.ts'
    ];
    for (const rel of files) {
      const src = await fs.readFile(path.join(__dirname, '..', 'src', rel), 'utf8');
      expect(src, rel).toContain('clampListPage');
    }
  });

  it('merchant SKU list binds MERCHANT_SKU_LIST_LIMIT', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant-sku.ts'),
      'utf8'
    );
    expect(src).toContain('MERCHANT_SKU_LIST_LIMIT');
    expect(src).toMatch(/LIMIT \?/);
    expect(src).not.toMatch(/LIMIT 500/);
    expect(MERCHANT_SKU_LIST_LIMIT).toBe(500);
  });

  it('execution timeline binds EXECUTION_TIMELINE_LIMIT + snapshot cap', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-execution.service.ts'),
      'utf8'
    );
    expect(src).toContain('EXECUTION_TIMELINE_LIMIT');
    expect(src).toContain('EXECUTION_SNAPSHOT_MAX_CHARS');
    expect(src).toMatch(/LIMIT \?/);
    expect(src).not.toMatch(/LIMIT 500/);
    expect(src).not.toMatch(/const SNAPSHOT_MAX/);
    expect(EXECUTION_TIMELINE_LIMIT).toBe(500);
    expect(EXECUTION_SNAPSHOT_MAX_CHARS).toBe(8_000);
  });

  it('dashboard takes bind named ceilings', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'dashboard.service.ts'),
      'utf8'
    );
    expect(src).toContain('DASHBOARD_COPY_PERF_TAKE');
    expect(src).toContain('DASHBOARD_GENERATED_COPY_TAKE');
    expect(src).not.toMatch(/take:\s*200\b/);
    expect(src).not.toMatch(/take:\s*500\b/);
    expect(DASHBOARD_COPY_PERF_TAKE).toBe(200);
    expect(DASHBOARD_GENERATED_COPY_TAKE).toBe(500);
  });

  it('RuleConfig cache prunes at RULE_CONFIG_CACHE_MAX', () => {
    const cache = new Map<string, CacheEntry>();
    const ttl = 60_000;
    for (let i = 0; i < RULE_CONFIG_CACHE_MAX + 25; i++) {
      setRuleCacheEntry(cache, `m:merchant-${i}|t:promotion`, { i }, ttl);
    }
    expect(cache.size).toBe(RULE_CONFIG_CACHE_MAX);
    // Oldest keys should have been evicted.
    expect(getRuleCacheEntry(cache, 'm:merchant-0|t:promotion')).toBeUndefined();
    expect(
      getRuleCacheEntry(cache, `m:merchant-${RULE_CONFIG_CACHE_MAX + 24}|t:promotion`)
    ).toEqual({ i: RULE_CONFIG_CACHE_MAX + 24 });
    expect(RULE_CONFIG_CACHE_MAX).toBe(512);
  });

  it('HtmlFetcher logs redact query strings', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'package-detail', 'html-fetcher.ts'),
      'utf8'
    );
    expect(src).toContain('function redactUrl');
    expect(src).toMatch(/redactUrl\(url\)/);
    // Full URL must not be interpolated into logger calls after redaction.
    expect(src).not.toMatch(/logger\.(log|warn|error)\(`Fetching: \$\{url\}`\)/);
    expect(src).not.toMatch(/logger\.(log|warn|error)\(`Failed to fetch \$\{url\}:`/);
  });

  it('shared resolvePagination clamps page at LIST_PAGE_MAX family', async () => {
    const { resolvePagination } = await import('@content/shared');
    const r = resolvePagination(9_999, 20, 1_000_000);
    expect(r.page).toBe(LIST_PAGE_MAX);
    expect(clampListPage(9_999)).toBe(LIST_PAGE_MAX);
  });
});
