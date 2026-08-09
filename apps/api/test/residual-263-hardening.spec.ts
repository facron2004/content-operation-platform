import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');

describe('residual #263 merchant-sales CSV export honesty (#262 parity)', () => {
  it('queryExportCsv returns csv + total/truncated/limit meta', async () => {
    const src = await readFile(
      path.join(srcRoot, 'merchant-sales', 'merchant-sales-export-query.ts'),
      'utf8'
    );
    const start = src.indexOf('export async function queryExportCsv');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('// --- merchant-sales-metrics-sql.ts ---', start + 10);
    const block = src.slice(start, end > 0 ? end : start + 900);
    expect(block).toMatch(/MerchantSalesExportResult/);
    expect(block).toMatch(/countMerchants/);
    expect(block).toMatch(/CSV_EXPORT_MAX_ROWS/);
    expect(block).toMatch(/truncated/);
    expect(block).toMatch(/total/);
    expect(block).toMatch(/limit/);
    expect(block).toMatch(/csv:/);
  });

  it('controller export sets X-Export-* when truncated', async () => {
    const src = await readFile(
      path.join(srcRoot, 'merchant-sales', 'merchant-sales.controller.ts'),
      'utf8'
    );
    const start = src.indexOf("@Get('export')");
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf("@Post('refresh')", start + 10);
    const block = src.slice(start, end > 0 ? end : start + 900);
    expect(block).toMatch(/@Res\(\)/);
    expect(block).toMatch(/X-Export-Truncated/);
    expect(block).toMatch(/X-Export-Limit/);
    expect(block).toMatch(/X-Export-Total/);
    expect(block).toMatch(/result\.truncated/);
    expect(block).toMatch(/result\.csv/);
  });

  it('SPA merchant-sales export still routes through downloadBlob', async () => {
    const src = await readFile(
      path.join(webRoot, 'features', 'merchant-sales', 'composables', 'merchant-sales-core.ts'),
      'utf8'
    );
    expect(src).toMatch(/exportMerchantSalesCsv/);
    expect(src).toMatch(/downloadBlob/);
    expect(src).toMatch(/getMerchantSalesExportUrl/);
  });
});
