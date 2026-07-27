import { describe, expect, it } from 'vitest';

describe('residual #86 distribution-task batchCreate FK batch-preload', () => {
  it('batchCreate pre-validates via loadTaskFkBatch + map asserts (not N× await)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    expect(src).toContain('loadTaskFkBatch');
    expect(src).toContain('assertOptionalTaskFksFromMaps');
    expect(src).toContain('resolveActiveAssigneeFromMap');
    expect(src).toContain('type TaskFkMaps');

    const fnStart = src.indexOf('async batchCreate(dtos: CreateTaskDto[])');
    expect(fnStart).toBeGreaterThan(0);
    // Next top-level method after batchCreate.
    const next = src.indexOf('\n  async update(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    // One batch preload, then pure map asserts in the loop.
    expect(fn).toContain('loadTaskFkBatch(list)');
    expect(fn).toContain('assertOptionalTaskFksFromMaps');
    expect(fn).toContain('resolveActiveAssigneeFromMap');
    // Pre-validate loop must not re-await the single-row wrappers (N× SELECTs).
    expect(fn).not.toMatch(/await\s+this\.assertOptionalTaskFks\s*\(/);
    expect(fn).not.toMatch(/await\s+this\.resolveActiveAssignee\s*\(/);
  });

  it('loadTaskFkBatch parallel-INs packages/campaigns/groups/contents/twins/assignees', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('private async loadTaskFkBatch');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  private async assertOptionalTaskFks', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    expect(fn).toContain('Promise.all');
    expect(fn).toContain('ContentPackage');
    expect(fn).toContain('MarketingCampaign');
    expect(fn).toContain('CommunityGroup');
    expect(fn).toContain('GeneratedCopy');
    expect(fn).toContain('DistributionTask');
    expect(fn).toContain('AppUser');
    // Twin scan excludes cancelled so re-bind after cancel still works.
    expect(fn).toMatch(/status"\s*<>\s*'cancelled'/);
  });

  it('single-row create loads maps once then asserts (TOCTOU path preserved)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    // create() still loads FKs (one batch) then pure map asserts before insert.
    const createStart = src.indexOf('async create(dto: CreateTaskDto)');
    expect(createStart).toBeGreaterThan(0);
    const createEnd = src.indexOf('\n  /** Shared status integrity', createStart + 10);
    const createFn = src.slice(createStart, createEnd > 0 ? createEnd : undefined);
    expect(createFn).toContain('loadTaskFkBatch');
    expect(createFn).toContain('assertOptionalTaskFksFromMaps');
    expect(createFn).toContain('resolveActiveAssigneeFromMap');

    // Wrappers still exist for update/publish paths that call them.
    const assertStart = src.indexOf('private async assertOptionalTaskFks(dto:');
    expect(assertStart).toBeGreaterThan(0);
    const assertEnd = src.indexOf('\n  private assertOptionalTaskFksFromMaps', assertStart + 10);
    const assertFn = src.slice(assertStart, assertEnd > 0 ? assertEnd : undefined);
    expect(assertFn).toContain('loadTaskFkBatch');
    expect(assertFn).toContain('assertOptionalTaskFksFromMaps');
  });
});
