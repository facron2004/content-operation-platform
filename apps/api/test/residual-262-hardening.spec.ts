import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');

describe('residual #262 CSV export 1000-row honesty', () => {
  it('zero-sales export sets X-Export-* headers when truncated', async () => {
    const src = await readFile(
      path.join(srcRoot, 'zero-sales', 'zero-sales.controller.ts'),
      'utf8'
    );
    const start = src.indexOf('async exportSkus');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf("@Get('skus/:packageId/timeline')", start + 10);
    const block = src.slice(start, end > 0 ? end : start + 1200);
    expect(block).toMatch(/X-Export-Truncated/);
    expect(block).toMatch(/X-Export-Limit/);
    expect(block).toMatch(/X-Export-Total/);
    expect(block).toMatch(/CSV_EXPORT_MAX_ROWS/);
    expect(block).toMatch(/pagination\?\.hasMore|hasMore === true/);
  });

  it('movement stagnant export sets X-Export-* headers when truncated', async () => {
    const src = await readFile(path.join(srcRoot, 'movement', 'movement.controller.ts'), 'utf8');
    const start = src.indexOf('async function exportStagnantCsv');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('@ApiTags', start + 10);
    const block = src.slice(start, end > 0 ? end : start + 900);
    expect(block).toMatch(/X-Export-Truncated/);
    expect(block).toMatch(/X-Export-Limit/);
    expect(block).toMatch(/X-Export-Total/);
    expect(block).toMatch(/CSV_EXPORT_MAX_ROWS/);
  });

  it('CORS exposes export honesty headers to SPA', async () => {
    const src = await readFile(path.join(srcRoot, 'bootstrap-middleware.ts'), 'utf8');
    expect(src).toMatch(/exposedHeaders/);
    expect(src).toMatch(/X-Export-Truncated/);
    expect(src).toMatch(/X-Export-Limit/);
    expect(src).toMatch(/X-Export-Total/);
  });

  it('downloadBlobWithClient toasts when X-Export-Truncated=1', async () => {
    const src = await readFile(path.join(webRoot, 'services', 'http-client-pipeline.ts'), 'utf8');
    const start = src.indexOf('export async function downloadBlobWithClient');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('export async function handleHttpError', start + 10);
    const block = src.slice(start, end > 0 ? end : start + 800);
    expect(block).toMatch(/x-export-truncated/i);
    expect(block).toMatch(/ElMessage\.warning/);
    expect(block).toMatch(/导出已截断/);
  });
});
