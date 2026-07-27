import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { MERCHANT_COMPETITORS_LIMIT } from '../src/common/sql-chunk';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');

describe('residual #285 merchant competitors LIMIT honesty', () => {
  it('MERCHANT_COMPETITORS_LIMIT is 5', () => {
    expect(MERCHANT_COMPETITORS_LIMIT).toBe(5);
  });

  it('loadCompetitors projects limit/matched/truncated via LIMIT+1 probe', async () => {
    const src = await readFile(path.join(srcRoot, 'merchant', 'merchant-competitors.ts'), 'utf8');
    expect(src).toMatch(/MERCHANT_COMPETITORS_LIMIT/);
    expect(src).toMatch(/LIMIT \?/);
    expect(src).not.toMatch(/LIMIT 5`/);
    expect(src).not.toMatch(/LIMIT 5,/);
    expect(src).toMatch(/limit \+ 1/);
    expect(src).toMatch(
      /truncated:\s*rows\.length\s*>\s*limit|const truncated\s*=\s*rows\.length\s*>\s*limit/
    );
    expect(src).toMatch(/matched:/);
    expect(src).toMatch(/truncated/);

    const service = await readFile(path.join(srcRoot, 'merchant', 'merchant.service.ts'), 'utf8');
    const start = service.indexOf('async listCompetitors');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = service.indexOf('async getHeatmap', start + 10);
    const fn = service.slice(start, end > 0 ? end : start + 400);
    expect(fn).toMatch(/loadCompetitors/);
    expect(fn).toMatch(/\.\.\.payload|limit|truncated/);
  });

  it('SPA MerchantCompetitorsResponse + table surface honesty', async () => {
    const api = await readFile(path.join(webRoot, 'services', 'api', 'merchant.api.ts'), 'utf8');
    const typeStart = api.indexOf('export interface MerchantCompetitorsResponse');
    expect(typeStart).toBeGreaterThanOrEqual(0);
    const typeEnd = api.indexOf('export async function listMerchants', typeStart + 10);
    const typeBody = api.slice(typeStart, typeEnd > 0 ? typeEnd : typeStart + 400);
    expect(typeBody).toMatch(/limit\?:/);
    expect(typeBody).toMatch(/matched\?:/);
    expect(typeBody).toMatch(/truncated\?:/);

    const table = await readFile(
      path.join(webRoot, 'features', 'merchants', 'components', 'MerchantCompetitorsTable.vue'),
      'utf8'
    );
    expect(table).toMatch(/truncated/);
    expect(table).toMatch(/Top/);
    expect(table).toMatch(/list-cap-hint|仅展示/);

    const core = await readFile(
      path.join(webRoot, 'features', 'merchants', 'composables', 'merchant-core.ts'),
      'utf8'
    );
    expect(core).toMatch(/competitorsTruncated/);
    expect(core).toMatch(/competitorsLimit/);
    expect(core).toMatch(/competitorsMatched/);
  });
});
