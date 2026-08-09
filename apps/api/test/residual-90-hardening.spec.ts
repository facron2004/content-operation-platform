import { describe, expect, it } from 'vitest';

describe('residual #90 batchCreate bulk tracking-code allocation', () => {
  it('batchCreate pre-allocates tracking codes via allocateTrackingCodes', async () => {
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

    const fnStart = src.indexOf('async batchCreate(dtos: CreateTaskDto[])');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  /** Status integrity checks', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    expect(fn).toContain('allocateTrackingCodes');
    expect(fn).toContain('trackingCode: trackingCodes[i]');
    // Must not N× mint inside the insert loop.
    expect(fn).not.toMatch(/await\s+this\.mintTrackingCode\s*\(/);
  });

  it('insertTaskRow accepts pre-allocated trackingCode opt', async () => {
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

    const fnStart = src.indexOf('private async insertRow');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  private isUniqueViolation', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    expect(fn).toMatch(/trackingCode\?:/);
    expect(fn).toContain('opts.trackingCode');
    // Fallback still mints for single-create path.
    expect(fn).toContain('allocateTrackingCode');
  });

  it('tracking-code module exposes bulk allocate + IN existence probe', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'common', 'tracking-code.ts'),
      'utf8'
    );

    expect(src).toContain('export async function allocateTrackingCodes');
    expect(src).toContain('export async function loadExistingTrackingCodes');
    expect(src).toMatch(/WHERE "trackingCode" IN/);
    // Single-row helper delegates to bulk (no dedicated COUNT(*) path).
    expect(src).not.toMatch(/SELECT COUNT\(\*\)/);
    const singleStart = src.indexOf('export async function allocateTrackingCode');
    expect(singleStart).toBeGreaterThan(0);
    const singleEnd = src.indexOf('\n}', singleStart);
    const single = src.slice(singleStart, singleEnd > 0 ? singleEnd + 2 : undefined);
    expect(single).toContain('allocateTrackingCodes');
  });
});
