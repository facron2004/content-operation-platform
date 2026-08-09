import { describe, expect, it } from 'vitest';

describe('residual #56 SELECT * hygiene', () => {
  it('community / campaign / audit / task publish avoid SELECT *', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const files = [
      'community/community.service.ts',
      'campaign/campaign.service.ts',
      'audit-log/audit-log.service.ts',
      'distribution-task/distribution-task.service.ts',
      'distribution-task/distribution-task-query.ts'
    ];
    for (const rel of files) {
      const src = await fs.readFile(path.join(__dirname, '..', 'src', rel), 'utf8');
      // Live SQL must not use SELECT *; comments mentioning SELECT * are ok.
      expect(src, rel).not.toMatch(/`SELECT \* FROM/);
      // Template-literal SQL: `SELECT t.* …` is forbidden; free-text comments may mention it.
      expect(src, rel).not.toMatch(/`SELECT t\.\*/);
      expect(src, rel).not.toMatch(/\$\{[^}]*\}\s*FROM ".*SELECT \*/);
    }
  });

  it('community getTasks reuses TASK_LIST_ROW_COLUMNS + trackingCode off', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );
    expect(src).toContain('TASK_LIST_ROW_COLUMNS');
    expect(src).toContain('COMMUNITY_ROW_COLUMNS');
    expect(src).toMatch(/includeTrackingCode:\s*false/);
  });

  it('campaign + audit bind named column lists', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const campaign = await fs.readFile(
      path.join(__dirname, '..', 'src', 'campaign', 'campaign.service.ts'),
      'utf8'
    );
    const audit = await fs.readFile(
      path.join(__dirname, '..', 'src', 'audit-log', 'audit-log.service.ts'),
      'utf8'
    );
    expect(campaign).toContain('CAMPAIGN_ROW_COLUMNS');
    expect(audit).toContain('AUDIT_LOG_ROW_COLUMNS');
  });

  it('exports TASK_ROW_COLUMNS + TASK_LIST_ROW_COLUMNS from distribution-task-query', async () => {
    const mod = await import('../src/distribution-task/distribution-task-query');
    expect(typeof mod.TASK_ROW_COLUMNS).toBe('string');
    expect(mod.TASK_ROW_COLUMNS).toContain('"taskId"');
    expect(mod.TASK_ROW_COLUMNS).toContain('"trackingCode"');
    expect(mod.TASK_ROW_COLUMNS).toContain('"body"');
    expect(typeof mod.TASK_LIST_ROW_COLUMNS).toBe('string');
    expect(mod.TASK_LIST_ROW_COLUMNS).toContain('"taskId"');
    expect(mod.TASK_LIST_ROW_COLUMNS).not.toContain('"body"');
    expect(mod.TASK_LIST_ROW_COLUMNS).not.toContain('"cta"');
    // Residual #146: status-mutate shell reuses list columns.
    expect(typeof mod.TASK_STATUS_MUTATE_COLUMNS).toBe('string');
    expect(mod.TASK_STATUS_MUTATE_COLUMNS).toBe(mod.TASK_LIST_ROW_COLUMNS);
  });
});

describe('residual #56 response body ceilings', () => {
  it('exports shared readResponseText + named max constants', async () => {
    const mod = await import('../src/common/response-body');
    expect(typeof mod.readResponseText).toBe('function');
    expect(mod.HTML_RESPONSE_MAX_BYTES).toBe(2 * 1024 * 1024);
    expect(mod.JSON_RESPONSE_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(mod.LOGIN_RESPONSE_MAX_BYTES).toBe(512 * 1024);
  });

  it('rejects Content-Length over max without materializing', async () => {
    const { readResponseText, ResponseBodyTooLargeError } =
      await import('../src/common/response-body');
    const body = {
      cancel: async () => undefined,
      getReader: () => {
        throw new Error('should not stream when Content-Length exceeds');
      }
    };
    const response = {
      headers: { get: (k: string) => (k.toLowerCase() === 'content-length' ? '99999999' : null) },
      body
    } as unknown as Response;
    await expect(readResponseText(response, 1024)).rejects.toBeInstanceOf(
      ResponseBodyTooLargeError
    );
  });

  it('streams and caps when no Content-Length', async () => {
    const { readResponseText, ResponseBodyTooLargeError } =
      await import('../src/common/response-body');
    const chunk = new Uint8Array(600);
    let reads = 0;
    const reader = {
      read: async () => {
        reads += 1;
        if (reads <= 2) return { done: false, value: chunk };
        return { done: true, value: undefined };
      },
      cancel: async () => undefined,
      releaseLock: () => undefined
    };
    const response = {
      headers: { get: () => null },
      body: { getReader: () => reader }
    } as unknown as Response;
    await expect(readResponseText(response, 1000)).rejects.toBeInstanceOf(
      ResponseBodyTooLargeError
    );
  });

  it('html-fetcher / data-source / auto-login use readResponseText', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const files = [
      'content/package-detail/html-fetcher.ts',
      'content/jeesite-data-source.client.ts',
      'content/auto-login-client.ts'
    ];
    for (const rel of files) {
      const src = await fs.readFile(path.join(__dirname, '..', 'src', rel), 'utf8');
      expect(src, rel).toContain('readResponseText');
      expect(src, rel).not.toMatch(/response\.text\(\)/);
    }
  });
});

describe('residual #56 single-flight + indexes', () => {
  it('geocode + merchant sync guard concurrent runs', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const geo = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant-geocoder.ts'),
      'utf8'
    );
    const contentSync = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'content-merchant-sync.service.ts'),
      'utf8'
    );
    expect(geo).toContain('geocodeRunning');
    expect(geo).toContain('skippedInFlight');
    expect(contentSync).toContain('merchantSyncRunning');
  });

  it('migration creates residual #56 stockLeft + createdAt indexes (VNext DB-003: no runtime DDL)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const sql = await fs.readFile(
      path.join(__dirname, '..', '..', '..', 'prisma', 'migrations', '0001_init', 'migration.sql'),
      'utf8'
    );
    expect(sql).toContain('ContentPackage_stockLeft_idx');
    expect(sql).toContain('MarketingCampaign_createdAt_idx');
    expect(sql).toContain('CommunityGroup_createdAt_idx');
    expect(sql).toContain('AppUser_createdAt_idx');
  });

  it('schema declares stockLeft + createdAt indexes', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const schema = await fs.readFile(
      path.join(__dirname, '..', '..', '..', 'prisma', 'schema.prisma'),
      'utf8'
    );
    expect(schema).toMatch(/@@index\(\[stockLeft\]\)/);
    expect(schema).toMatch(/@@index\(\[stockLeft, merchantId\]\)/);
    expect(schema).toMatch(/@@index\(\[areaId, stockLeft\]\)/);
  });
});
