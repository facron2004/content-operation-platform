import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { PLATFORM_SCAN_LIMIT } from '../src/common/sql-chunk';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');

describe('residual #269 merchant heatmap PLATFORM_SCAN_LIMIT honesty', () => {
  it('PLATFORM_SCAN_LIMIT stays at known ceiling', () => {
    expect(PLATFORM_SCAN_LIMIT).toBe(10_000);
  });

  it('MerchantHeatmapResponse declares limit/truncated', async () => {
    const src = await readFile(path.join(srcRoot, 'merchant', 'merchant-heatmap.ts'), 'utf8');
    const start = src.indexOf('export interface MerchantHeatmapResponse');
    expect(start).toBeGreaterThanOrEqual(0);
    const block = src.slice(start, start + 500);
    expect(block).toMatch(/limit\?:/);
    expect(block).toMatch(/truncated\?:/);
  });

  it('buildMerchantHeatmap projects limit/truncated head-full honesty', async () => {
    const src = await readFile(path.join(srcRoot, 'merchant', 'merchant-heatmap.ts'), 'utf8');
    const start = src.indexOf('export async function buildMerchantHeatmap');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('\nasync function loadCoordsByMerchantId', start + 10);
    const fn = src.slice(start, end > 0 ? end : undefined);
    expect(fn).toMatch(/PLATFORM_SCAN_LIMIT/);
    expect(fn).toMatch(/truncated\s*=\s*rows\.length\s*>=\s*limit/);
    expect(fn).toMatch(/limit,/);
    expect(fn).toMatch(/truncated/);
    // totalMerchants stays returned-head size.
    expect(fn).toMatch(/totalMerchants:\s*rows\.length/);
  });

  it('SPA MerchantHeatmapResponse declares limit/truncated', async () => {
    const src = await readFile(path.join(webRoot, 'services', 'api', 'merchant.api.ts'), 'utf8');
    const start = src.indexOf('export interface MerchantHeatmapResponse');
    expect(start).toBeGreaterThanOrEqual(0);
    const block = src.slice(start, start + 400);
    expect(block).toMatch(/limit\?:/);
    expect(block).toMatch(/truncated\?:/);
  });

  it('useMerchantHeatmap exposes truncated/limit', async () => {
    const src = await readFile(
      path.join(webRoot, 'features', 'merchant-heatmap', 'composables', 'useMerchantHeatmap.ts'),
      'utf8'
    );
    expect(src).toMatch(
      /truncated\s*=\s*computed\(\(\)\s*=>\s*Boolean\(data\.value\?\.truncated\)\)/
    );
    expect(src).toMatch(/limit\s*=\s*computed\(\(\)\s*=>\s*data\.value\?\.limit/);
    expect(src).toMatch(/truncated,/);
    expect(src).toMatch(/limit,/);
  });

  it('MerchantHeatmapView shows list-cap-hint when truncated', async () => {
    const src = await readFile(path.join(webRoot, 'views', 'MerchantHeatmapView.vue'), 'utf8');
    expect(src).toMatch(/list-cap-hint/);
    expect(src).toMatch(/v-if="truncated"/);
    expect(src).toMatch(/limitLabel/);
    expect(src).toMatch(/热力图仅加载前/);
    expect(src).toMatch(/truncated,/);
    expect(src).toMatch(/limit,/);
  });
});
