import { describe, expect, it } from 'vitest';

describe('residual #86 distribution-task batchCreate FK batch-preload', () => {
  it('batchCreate pre-validates via loadTaskFkBatch + map asserts (not N× await)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(
        __dirname,
        '..',
        'src',
        'distribution-task',
        'application',
        'create-task.service.ts'
      ),
      'utf8'
    );
    const fk = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task-fk.ts'),
      'utf8'
    );

    expect(src).toContain('loadTaskFkBatch');
    expect(src).toContain('assertOptionalTaskFksFromMaps');
    expect(src).toContain('resolveFromMap');
    expect(fk).toContain('type TaskFkMaps');

    const fnStart = src.indexOf('async batchCreate(dtos: CreateTaskDto[])');
    expect(fnStart).toBeGreaterThan(0);
    // Next top-level method after batchCreate.
    const next = src.indexOf('\n  async update(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    // One batch preload, then pure map asserts in the loop.
    expect(fn).toContain('loadTaskFkBatch(this.prisma, list)');
    expect(fn).toContain('assertOptionalTaskFksFromMaps');
    expect(fn).toContain('resolveFromMap');
    // Pre-validate loop must not re-await the single-row wrappers (N× SELECTs).
    expect(fn).not.toMatch(/await\s+this\.assertOptionalTaskFks\s*\(/);
    expect(fn).not.toMatch(/await\s+this\.resolveActiveAssignee\s*\(/);
  });

  it('loadTaskFkBatch parallel-INs packages/campaigns/groups/contents/twins/assignees', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const fk = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task-fk.ts'),
      'utf8'
    );

    const fnStart = fk.indexOf('export async function loadTaskFkBatch');
    expect(fnStart).toBeGreaterThan(0);
    const next = fk.indexOf('\n/**', fnStart + 10);
    const fn = fk.slice(fnStart, next > 0 ? next : undefined);

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
      path.join(
        __dirname,
        '..',
        'src',
        'distribution-task',
        'application',
        'create-task.service.ts'
      ),
      'utf8'
    );
    const fk = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task-fk.ts'),
      'utf8'
    );

    // create() still loads FKs (one batch) then pure map asserts before insert.
    const createStart = src.indexOf('async create(dto: CreateTaskDto)');
    expect(createStart).toBeGreaterThan(0);
    const createEnd = src.indexOf('\n  async batchCreate(', createStart + 10);
    const createFn = src.slice(createStart, createEnd > 0 ? createEnd : undefined);
    expect(createFn).toContain('loadTaskFkBatch');
    expect(createFn).toContain('assertOptionalTaskFksFromMaps');
    expect(createFn).toContain('resolveFromMap');

    // The shared wrapper still exists for update/publish paths.
    const assertStart = fk.indexOf('export async function assertOptionalTaskFks(');
    expect(assertStart).toBeGreaterThan(0);
    const assertEnd = fk.indexOf(
      '\nexport function assertOptionalTaskFksFromMaps',
      assertStart + 10
    );
    const assertFn = fk.slice(assertStart, assertEnd > 0 ? assertEnd : undefined);
    expect(assertFn).toContain('loadTaskFkBatch');
    expect(assertFn).toContain('assertOptionalTaskFksFromMaps');
  });
});
