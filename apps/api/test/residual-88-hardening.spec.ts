import { describe, expect, it } from 'vitest';

describe('residual #88 batchCreate insert-path maps reuse + slim return', () => {
  it('batchCreate inserts via insertTaskRow (not create())', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async batchCreate(dtos: CreateTaskDto[])');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async update(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    // One batch preload shared for pre-validate + insert.
    expect(fn).toContain('loadTaskFkBatch(list)');
    expect(fn).toContain('insertTaskRow');
    // Residual #172: no fullDetail flag — insert always returns slim shell.
    expect(fn).not.toMatch(/fullDetail/);
    // Must not re-enter create() (which would N× reload FKs).
    expect(fn).not.toMatch(/await\s+this\.create\s*\(/);
    expect(fn).not.toMatch(/await\s+this\.assertOptionalTaskFks\s*\(/);
    expect(fn).not.toMatch(/await\s+this\.resolveActiveAssignee\s*\(/);
    // Residual #172: batch returns count shell only.
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toMatch(/created:/);
    expect(fn).not.toMatch(/items:\s*results/);
  });

  it('create() loads FK maps once (not separate assert + resolve rounds)', async () => {
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

    // Single loadTaskFkBatch call for both FK assert and assignee resolve.
    const loads = createFn.match(/this\.loadTaskFkBatch/g) ?? [];
    expect(loads.length).toBe(1);
    expect(createFn).toContain('assertOptionalTaskFksFromMaps');
    expect(createFn).toContain('resolveActiveAssigneeFromMap');
    expect(createFn).toContain('insertTaskRow');
    // Residual #172: no fullDetail flag.
    expect(createFn).not.toMatch(/fullDetail/);
  });

  it('insertTaskRow returns slim shell (no free-form / trackingCode / fullDetail)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('private async insertTaskRow');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  /** Status-only probe', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    // Residual #172: slim shell only.
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toMatch(/taskId/);
    expect(fn).toMatch(/status/);
    expect(fn).not.toMatch(/fullDetail/);
    expect(fn).not.toMatch(/const synthesized/);
    expect(fn).not.toMatch(/executions:\s*\[\]/);
    // trackingCode still minted for storage but not returned on happy path.
    expect(fn).toContain('mintTrackingCode');
    expect(fn).toContain('opts.trackingCode');
    // Response shell must not include trackingCode field assignment.
    expect(fn).not.toMatch(/return \{[\s\S]*trackingCode/);
  });
});
