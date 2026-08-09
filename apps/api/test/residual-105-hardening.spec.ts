import { describe, expect, it } from 'vitest';

describe('residual #105 getPerformance/getTasks drop service pre-getById', () => {
  it('campaign getPerformance has no pre-getById', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'campaign', 'campaign.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async getPerformance(id: string)');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  private async assertScopeIdsExist', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    expect(fn).not.toMatch(/await this\.getById\(id\)/);
    expect(fn).toContain('DistributionTask');
    expect(fn).toContain('TaskPerformanceDaily');
  });

  it('community getPerformance + getTasks have no pre-getById', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );

    const perfStart = src.indexOf('async getPerformance(id: string)');
    expect(perfStart).toBeGreaterThan(0);
    const tasksStart = src.indexOf('async getTasks(id: string', perfStart + 10);
    const perf = src.slice(perfStart, tasksStart > 0 ? tasksStart : undefined);
    expect(perf).not.toMatch(/await this\.getById\(id\)/);
    expect(perf).toContain('DistributionTask');

    const tasksEnd = src.indexOf('\n  private async assertAreaExists', tasksStart + 10);
    const tasks = src.slice(tasksStart, tasksEnd > 0 ? tasksEnd : undefined);
    expect(tasks).not.toMatch(/await this\.getById\(id\)/);
    expect(tasks).toContain('clampListPage');
  });

  it('distribution-task getPerformance has no pre-getById (no executions reload)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task-read.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('export function getDistributionTaskPerformance(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n}', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    expect(fn).not.toMatch(/await this\.getById\(id\)/);
    expect(fn).toContain('getTaskPerformance');
  });
});
