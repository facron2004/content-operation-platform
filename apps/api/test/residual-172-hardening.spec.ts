import { describe, expect, it } from 'vitest';

describe('residual #172 DT create/batchCreate slim shells', () => {
  it('create returns slim shell (no free-form / trackingCode / getTaskRow)', async () => {
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

    expect(createFn).toMatch(/insertTaskRow/);
    expect(createFn).not.toMatch(/fullDetail/);
    // Idempotent hit slim.
    expect(createFn).toMatch(/success:\s*true/);
    expect(createFn).toMatch(/getTaskStatusOnly/);
    expect(createFn).not.toMatch(/return this\.getTaskRow\(/);
    expect(createFn).not.toMatch(/return this\.getById\(/);
  });

  it('insertTaskRow returns slim success shell (no free-form payload)', async () => {
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

    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).toMatch(/INSERT INTO "DistributionTask"/);
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toMatch(/taskId/);
    expect(fn).toMatch(/status/);
    expect(fn).not.toMatch(/const synthesized/);
    expect(fn).not.toMatch(/fullDetail/);
    expect(fn).not.toMatch(/executions:/);
    // trackingCode minted for DB but not returned on happy path.
    expect(fn).toContain('mintTrackingCode');
    expect(fn).not.toMatch(/return \{[\s\S]{0,80}trackingCode/);
    // UNIQUE race winner slim.
    expect(fn).toMatch(/getTaskStatusOnly\(winner\)/);
    expect(fn).not.toMatch(/return this\.getTaskRow\(/);
  });

  it('batchCreate returns count shell only (no items[] free-form)', async () => {
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

    expect(fn).toContain('insertTaskRow');
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toMatch(/created:/);
    expect(fn).not.toMatch(/items:\s*results/);
    expect(fn).not.toMatch(/fullDetail/);
    // Residual #96 bulk rollback preserved.
    expect(fn).toMatch(/ROLLBACK_CHUNK/);
  });
});
