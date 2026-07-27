import { describe, expect, it } from 'vitest';

describe('residual #175 cancel reason wire-up (API side)', () => {
  it('CancelTaskDto exposes reason (not cancelReason)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'dto', 'task-action.dto.ts'),
      'utf8'
    );
    const classStart = src.indexOf('export class CancelTaskDto');
    expect(classStart).toBeGreaterThanOrEqual(0);
    const next = src.indexOf('export class', classStart + 10);
    const cls = src.slice(classStart, next > 0 ? next : undefined);
    expect(cls).toMatch(/reason\?:/);
    expect(cls).not.toMatch(/cancelReason/);
  });

  it('controller passes body.reason into svc.cancel', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.controller.ts'),
      'utf8'
    );
    const fnStart = src.search(/async cancel\(\s*@Param\('id'\)/);
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  @', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);
    expect(fn).toMatch(/body\?\.reason/);
    expect(fn).toMatch(/this\.svc\.cancel\(safeId,\s*body\?\.reason/);
  });

  it('service cancel writes cancelReason column from reason arg', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('async cancel(id: string, reason?: string');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  /**', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);
    expect(fn).toMatch(/"cancelReason"\s*=\s*\?/);
    expect(fn).toMatch(/reason \?\? null/);
  });
});
