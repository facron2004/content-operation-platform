import { describe, expect, it } from 'vitest';

describe('residual #141 DT create (superseded by #172 slim shell)', () => {
  it('insertTaskRow returns slim shell (no free-form synthesis)', async () => {
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

    // Residual #172: slim shell — no free-form / trackingCode response.
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toMatch(/taskId/);
    expect(fn).toMatch(/status/);
    expect(fn).not.toMatch(/const synthesized/);
    expect(fn).not.toMatch(/fullDetail/);
    expect(fn).not.toMatch(/if\s*\(\s*opts\.fullDetail\s*\)/);
    // UNIQUE race winner status-only (cannot synthesize without winner columns).
    expect(fn).toMatch(/getTaskStatusOnly\(winner\)/);
    expect(fn).not.toMatch(/return this\.getTaskRow\(winner\)/);
  });

  it('create() idempotent hit slim shell; never getById', async () => {
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

    expect(createFn).toMatch(/success:\s*true/);
    expect(createFn).toMatch(/getTaskStatusOnly/);
    expect(createFn).not.toMatch(/return this\.getTaskRow\(/);
    expect(createFn).not.toMatch(/return this\.getById\(/);
  });
});
