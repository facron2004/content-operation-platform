import { describe, expect, it } from 'vitest';

describe('residual #123 resolveActiveAssignee single-row AppUser', () => {
  it('resolveActiveAssignee probes AppUser only (not loadTaskFkBatch)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('private async resolveActiveAssignee(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  private resolveActiveAssigneeFromMap', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    // Direct AppUser SELECT for the single-id path used by update/reassign.
    expect(fn).toMatch(/SELECT "userId", "displayName", "username", "isActive"/);
    expect(fn).toMatch(/FROM "AppUser" WHERE "userId" = \?/);
    // Must not pay the 6-IN batch preload for one assignee id.
    expect(fn).not.toMatch(/loadTaskFkBatch/);
    // Same error semantics as map path.
    expect(fn).toMatch(/指派用户不存在/);
    expect(fn).toMatch(/指派用户已停用/);
  });

  it('create/batchCreate still resolve via map (batch path unchanged)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    const createStart = src.indexOf('async create(dto: CreateTaskDto)');
    expect(createStart).toBeGreaterThan(0);
    const createEnd = src.indexOf('\n  /** Shared status integrity', createStart + 10);
    const createFn = src.slice(createStart, createEnd > 0 ? createEnd : undefined);
    expect(createFn).toContain('resolveActiveAssigneeFromMap');
    expect(createFn).not.toMatch(/await this\.resolveActiveAssignee\s*\(/);

    const batchStart = src.indexOf('async batchCreate(dtos: CreateTaskDto[])');
    expect(batchStart).toBeGreaterThan(0);
    const batchEnd = src.indexOf('\n  async update(', batchStart + 10);
    const batchFn = src.slice(batchStart, batchEnd > 0 ? batchEnd : undefined);
    expect(batchFn).toContain('resolveActiveAssigneeFromMap');
    expect(batchFn).not.toMatch(/await this\.resolveActiveAssignee\s*\(/);
  });
});
