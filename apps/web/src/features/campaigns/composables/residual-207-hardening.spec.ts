import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → campaigns → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #207 campaign list status CTAs', () => {
  it('CampaignListTable emits start/pause/complete/cancel with status gates', async () => {
    const src = await readFile(path.join(__dirname, '../components/CampaignListTable.vue'), 'utf8');
    expect(src).toMatch(/emit\(['"]start['"]/);
    expect(src).toMatch(/emit\(['"]pause['"]/);
    expect(src).toMatch(/emit\(['"]complete['"]/);
    expect(src).toMatch(/emit\(['"]cancel['"]/);
    expect(src).toMatch(/canStart/);
    expect(src).toMatch(/canPause/);
    expect(src).toMatch(/canComplete/);
    expect(src).toMatch(/canCancel/);
    // Gates mirror CampaignDetailHero.
    expect(src).toMatch(/status === 'draft' \|\| row\.status === 'paused'/);
    expect(src).toMatch(/status === 'active'/);
  });

  it('useCampaigns exposes list transition handlers calling campaign clients', async () => {
    const src = await readFile(path.join(__dirname, 'useCampaigns.ts'), 'utf8');
    expect(src).toMatch(/async function handleStart/);
    expect(src).toMatch(/async function handlePause/);
    expect(src).toMatch(/async function handleComplete/);
    expect(src).toMatch(/async function handleCancel/);
    expect(src).toMatch(/api\.startCampaign/);
    expect(src).toMatch(/api\.pauseCampaign/);
    expect(src).toMatch(/api\.completeCampaign/);
    expect(src).toMatch(/api\.cancelCampaign/);
    // Cancel confirms before mutate.
    const cancelStart = src.indexOf('async function handleCancel');
    expect(cancelStart).toBeGreaterThanOrEqual(0);
    const cancel = src.slice(cancelStart, cancelStart + 500);
    expect(cancel).toMatch(/ElMessageBox\.confirm/);
    // Success reloads list.
    expect(src).toMatch(/reloadCurrentPage/);
  });

  it('CampaignsView wires table status events to handlers', async () => {
    const src = await readFile(path.join(srcRoot, 'views/CampaignsView.vue'), 'utf8');
    expect(src).toMatch(/@start="handleStart"/);
    expect(src).toMatch(/@pause="handlePause"/);
    expect(src).toMatch(/@complete="handleComplete"/);
    expect(src).toMatch(/@cancel="handleCancel"/);
  });

  it('CampaignsView surfaces paged-list failures without hiding existing rows', async () => {
    const view = await readFile(path.join(srcRoot, 'views/CampaignsView.vue'), 'utf8');
    const list = await readFile(path.join(srcRoot, 'composables/usePagedList.ts'), 'utf8');
    expect(view).toMatch(/import ErrorAlert from ['"]\.\.\/components\/ErrorAlert\.vue['"]/);
    expect(view).toMatch(/<ErrorAlert :message="loadError" \/>/);
    expect(view).toMatch(/error:\s*loadError/);
    expect(list).toMatch(/Keep previous items visible while fetching/);
    expect(list).toMatch(/error\.value = msg/);
  });

  it('campaign.api clients still post transition paths', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/campaign.api.ts'), 'utf8');
    for (const name of ['startCampaign', 'pauseCampaign', 'completeCampaign', 'cancelCampaign']) {
      const fnStart = src.indexOf(`export async function ${name}`);
      expect(fnStart).toBeGreaterThanOrEqual(0);
      const fnEnd = src.indexOf('export async function', fnStart + 30);
      const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
      expect(fn).toMatch(/client\.post/);
      expect(fn).toMatch(/clearCache\(['"]\/campaigns['"]\)/);
    }
  });
});
