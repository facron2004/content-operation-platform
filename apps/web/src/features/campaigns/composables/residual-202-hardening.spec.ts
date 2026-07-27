import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → campaigns → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #202 campaign startDateFrom/startDateTo SPA filters', () => {
  it('CampaignFilters includes startDateFrom/startDateTo', async () => {
    const src = await readFile(path.join(__dirname, 'useCampaigns.ts'), 'utf8');
    expect(src).toMatch(/startDateFrom:\s*string/);
    expect(src).toMatch(/startDateTo:\s*string/);
    const callStart = src.indexOf('api.listCampaigns(');
    expect(callStart).toBeGreaterThanOrEqual(0);
    const callEnd = src.indexOf('});', callStart + 10);
    const call = src.slice(callStart, callEnd > 0 ? callEnd + 3 : undefined);
    expect(call).toMatch(/startDateFrom:\s*filters\.startDateFrom/);
    expect(call).toMatch(/startDateTo:\s*filters\.startDateTo/);
  });

  it('listCampaigns client accepts startDateFrom/startDateTo', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/campaign.api.ts'), 'utf8');
    const fnStart = src.indexOf('export async function listCampaigns');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('export async function getCampaign', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/startDateFrom\?/);
    expect(fn).toMatch(/startDateTo\?/);
  });

  it('CampaignFilterBar exposes startDate date pickers', async () => {
    const src = await readFile(path.join(__dirname, '../components/CampaignFilterBar.vue'), 'utf8');
    expect(src).toMatch(/model\.startDateFrom/);
    expect(src).toMatch(/model\.startDateTo/);
    expect(src).toMatch(/YYYY-MM-DD/);
  });

  it('CampaignQueryDto still declares startDateFrom/startDateTo', async () => {
    const src = await readFile(
      path.join(srcRoot, '../../api/src/campaign/dto/campaign-query.dto.ts'),
      'utf8'
    );
    expect(src).toMatch(/startDateFrom\?:/);
    expect(src).toMatch(/startDateTo\?:/);
  });
});
