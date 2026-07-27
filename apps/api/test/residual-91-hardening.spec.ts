import { describe, expect, it } from 'vitest';

describe('residual #91 updateSkuCounts bulk CASE UPDATE', () => {
  it('updateSkuCounts uses one CASE UPDATE per chunk (no N serial UPDATEs)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant-address-updater.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async function updateSkuCounts');
    expect(fnStart).toBeGreaterThan(0);
    const fn = src.slice(fnStart);

    // Batch COUNT still present (#80).
    expect(fn).toContain('GROUP BY "merchantId"');
    expect(fn).toContain('COUNT(*) AS "totalSku"');
    // Bulk write (#91).
    expect(fn).toMatch(/CASE\s+"merchantId"/);
    expect(fn).toContain('WHEN ? THEN ?');
    // No per-merchant await UPDATE loop.
    expect(fn).not.toMatch(
      /for\s*\(\s*const\s+merchantId\s+of\s+slice\s*\)[\s\S]{0,200}UPDATE\s+"Merchant"/
    );
    expect(fn).not.toMatch(
      /UPDATE\s+"Merchant"\s+SET\s+"totalSku"\s*=\s*\?\s*,\s*"lastSeenAt"\s*=\s*\?\s+WHERE\s+"merchantId"\s*=\s*\?/
    );
  });

  it('updateSkuCounts still defaults missing GROUP BY rows to totalSku=0', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant-address-updater.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('async function updateSkuCounts');
    const fn = src.slice(fnStart);
    expect(fn).toContain('countByMerchant.get(merchantId) ?? 0');
    expect(fn).toContain('lastSeenAt');
  });
});
