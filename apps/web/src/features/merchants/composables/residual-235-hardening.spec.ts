import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → merchants → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #235 merchant detail days selectable', () => {
  it('merchant-core clamps days 7–90 and loadMerchantDetail forwards days', async () => {
    const src = await readFile(path.join(__dirname, 'merchant-core.ts'), 'utf8');
    expect(src).toMatch(
      /export const MERCHANT_DETAIL_DAY_OPTIONS\s*=\s*\[7,\s*14,\s*30,\s*60,\s*90\]/
    );
    expect(src).toMatch(/export function clampMerchantDetailDays/);
    expect(src).toMatch(/if \(n < 7\) return 7/);
    expect(src).toMatch(/if \(n > 90\) return 90/);
    expect(src).toMatch(/detailDays:\s*ref\(30\)/);
    expect(src).toMatch(/getMerchantTrend\(params\.merchantId,\s*dayCount\)/);
    expect(src).toMatch(
      /getMerchantSkus\(params\.merchantId,\s*dayCount,\s*params\.force === true\)/
    );
    // Hard-coded 30 must no longer be the only load path.
    expect(src).not.toMatch(/getMerchantTrend\(params\.merchantId,\s*30\)/);
  });

  it('useMerchants exposes setDetailDays + detailDayOptions', async () => {
    const src = await readFile(path.join(__dirname, 'useMerchants.ts'), 'utf8');
    expect(src).toMatch(/async function setDetailDays/);
    expect(src).toMatch(/detailDays,/);
    expect(src).toMatch(/detailDayOptions:\s*MERCHANT_DETAIL_DAY_OPTIONS/);
    expect(src).toMatch(/setDetailDays,/);
    expect(src).toMatch(/days:\s*detailDays/);
  });

  it('MerchantDetailPanel day chips emit change-days', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/MerchantDetailPanel.vue'),
      'utf8'
    );
    expect(src).toMatch(/change-days/);
    expect(src).toMatch(/onDaysChange/);
    expect(src).toMatch(/day-chip/);
    expect(src).toMatch(/detailDays/);
  });

  it('MerchantsView wires detailDays + @change-days', async () => {
    const src = await readFile(path.join(srcRoot, 'views/MerchantsView.vue'), 'utf8');
    expect(src).toMatch(/:detail-days="detailDays"/);
    expect(src).toMatch(/@change-days="setDetailDays"/);
    expect(src).toMatch(/setDetailDays/);
  });

  it('MerchantTrendQueryDto already accepts days 7–90', async () => {
    const dto = await readFile(
      path.resolve(__dirname, '../../../../../../apps/api/src/merchant/merchant.dto.ts'),
      'utf8'
    );
    expect(dto).toMatch(/class MerchantTrendQueryDto/);
    expect(dto).toMatch(/@Min\(7\)/);
    expect(dto).toMatch(/MERCHANT_TREND_MAX_DAYS/);
  });
});
