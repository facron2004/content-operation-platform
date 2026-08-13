import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');

describe('residual #287 overview top-offenders LIMIT honesty', () => {
  it('loadTopOffenders projects items/limit/matched/truncated via LIMIT+1 probe', async () => {
    const src = await readFile(path.join(srcRoot, 'overview', 'overview-stale.ts'), 'utf8');
    const start = src.indexOf('export async function loadTopOffenders');
    expect(start).toBeGreaterThanOrEqual(0);
    const fn = src.slice(start, start + 1200);
    expect(fn).toMatch(/safeLimit \+ 1|limit \+ 1/);
    expect(fn).toMatch(/truncated\s*=\s*rows\.length\s*>\s*safeLimit/);
    expect(fn).toMatch(/matched:/);
    expect(fn).toMatch(/truncated/);
    expect(fn).toMatch(/items,/);
    expect(fn).toMatch(/limit:\s*safeLimit/);
  });

  it('controller/service still return loadTopOffenders payload object', async () => {
    const service = await readFile(path.join(srcRoot, 'overview', 'overview.service.ts'), 'utf8');
    expect(service).toMatch(/loadTopOffenders\(this\.prisma,\s*n,\s*asOf\)/);
    const controller = await readFile(
      path.join(srcRoot, 'overview', 'overview.controller.ts'),
      'utf8'
    );
    expect(controller).toMatch(
      /getTopOffenders\(\s*query\.limit,\s*hasForceSignal\(req,\s*query\),\s*query\.date\s*\)/
    );
  });

  it('SPA OverviewTopOffendersResponse + table surface honesty', async () => {
    const api = await readFile(path.join(webRoot, 'services', 'api', 'overview.api.ts'), 'utf8');
    expect(api).toMatch(/export interface OverviewTopOffendersResponse/);
    expect(api).toMatch(/get<OverviewTopOffendersResponse>/);
    expect(api).toMatch(/items:/);
    expect(api).toMatch(/truncated:/);

    const table = await readFile(
      path.join(webRoot, 'features', 'overview', 'components', 'OverviewOffendersTable.vue'),
      'utf8'
    );
    expect(table).toMatch(/truncated/);
    expect(table).toMatch(/list-cap-hint|仅展示/);
    expect(table).toMatch(/limitLabel/);

    const core = await readFile(
      path.join(webRoot, 'features', 'overview', 'composables', 'overview-core.ts'),
      'utf8'
    );
    expect(core).toMatch(/offendersTruncated/);
    expect(core).toMatch(/payload\.items/);
    expect(core).toMatch(/payload\.truncated/);

    const view = await readFile(path.join(webRoot, 'views', 'OverviewView.vue'), 'utf8');
    expect(view).toMatch(/offenders-truncated|offendersTruncated/);
    expect(view).toMatch(/:truncated="offendersTruncated"/);
  });
});
