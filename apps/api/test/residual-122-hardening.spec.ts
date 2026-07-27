import { describe, expect, it } from 'vitest';

describe('residual #122 DT create (superseded by #172 slim shell)', () => {
  it('create idempotent hit returns slim shell (no getTaskRow / getById)', async () => {
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

    // Residual #172: slim shell on idempotent hit.
    expect(createFn).toMatch(/success:\s*true/);
    expect(createFn).toMatch(/getTaskStatusOnly/);
    expect(createFn).not.toMatch(/return this\.getTaskRow\(existing\)/);
    expect(createFn).not.toMatch(/return this\.getById\(existing\)/);
  });

  it('insertTaskRow returns slim shell; UNIQUE winner also slim', async () => {
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

    // Residual #172: slim shell — no free-form synthesis.
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toMatch(/taskId/);
    expect(fn).not.toMatch(/const synthesized/);
    expect(fn).not.toMatch(/fullDetail/);
    // UNIQUE race winner still status-only (not full getTaskRow).
    expect(fn).toMatch(/getTaskStatusOnly\(winner\)/);
    expect(fn).not.toMatch(/return this\.getTaskRow\(winner\)/);
    expect(fn).not.toMatch(/return this\.getById\(/);
  });
});
