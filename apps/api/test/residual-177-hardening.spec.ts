import { describe, expect, it } from 'vitest';

describe('residual #177 redact idempotencyKey from detail reads', () => {
  it('TASK_ROW_COLUMNS / TASK_ROW_SELECT_T omit idempotencyKey', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task-query.ts'),
      'utf8'
    );

    // Full-row detail SELECT must not ship write-only client keys.
    const rowStart = src.indexOf('const TASK_ROW_COLUMNS =');
    expect(rowStart).toBeGreaterThan(0);
    const rowEnd = src.indexOf('const TASK_ROW_SELECT_T', rowStart + 10);
    const rowCols = src.slice(rowStart, rowEnd > 0 ? rowEnd : undefined);
    expect(rowCols).toMatch(/"trackingCode"/);
    expect(rowCols).toMatch(/"body"/);
    expect(rowCols).not.toMatch(/idempotencyKey/);

    const selectTStart = src.indexOf('const TASK_ROW_SELECT_T =');
    expect(selectTStart).toBeGreaterThan(0);
    const selectTEnd = src.indexOf('export { TASK_ROW_COLUMNS }', selectTStart + 10);
    const selectT = src.slice(selectTStart, selectTEnd > 0 ? selectTEnd : undefined);
    expect(selectT).toMatch(/t\."trackingCode"/);
    expect(selectT).not.toMatch(/idempotencyKey/);
  });

  it('parseTask never emits idempotencyKey', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task-query.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('export function parseTask');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\ntype PrismaQuery', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);
    expect(fn).not.toMatch(/idempotencyKey/);
    // trackingCode still opt-in.
    expect(fn).toMatch(/includeTrackingCode/);
  });

  it('TaskRow interface no longer requires idempotencyKey for reads', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task-query.ts'),
      'utf8'
    );
    const ifaceStart = src.indexOf('export interface TaskRow');
    expect(ifaceStart).toBeGreaterThan(0);
    const ifaceEnd = src.indexOf('export function parseTask', ifaceStart + 10);
    const iface = src.slice(ifaceStart, ifaceEnd > 0 ? ifaceEnd : undefined);
    expect(iface).not.toMatch(/idempotencyKey/);
  });

  it('create path still writes idempotencyKey to DB', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );
    // Write path preserved — only read path redacts.
    expect(src).toMatch(/"idempotencyKey"/);
    expect(src).toMatch(/findByIdempotencyKey/);
    expect(src).toMatch(/INSERT INTO "DistributionTask"/);
  });
});
