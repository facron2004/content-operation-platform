import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → campaigns → features → src
const srcRoot = path.resolve(__dirname, '../../..');
const sharedRoot = path.resolve(srcRoot, '../../../packages/shared/src');

describe('residual #254 campaign detail surfaces scope write fields', () => {
  it('CampaignDetailHero shows areaIds / merchantIds / ownerId (not just area count)', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/CampaignDetailHero.vue'),
      'utf8'
    );
    // Counts remain as summary chips.
    expect(src).toMatch(/campaign\.areaIds\?\.length/);
    expect(src).toMatch(/campaign\.merchantIds\?\.length/);
    // Residual #254: actual id tags (write fields already returned by API).
    expect(src).toMatch(/v-for="areaId in campaign\.areaIds"/);
    expect(src).toMatch(/v-for="merchantId in campaign\.merchantIds"/);
    expect(src).toMatch(/campaign\.ownerId/);
    expect(src).toMatch(/覆盖区域/);
    expect(src).toMatch(/关联商家/);
    expect(src).toMatch(/负责人/);
    expect(src).toMatch(/未绑定区域/);
    expect(src).toMatch(/未绑定商家/);
  });

  it('shared MarketingCampaign already declares residual fields (baseline)', async () => {
    const shared = await readFile(path.join(sharedRoot, 'api-task-types.ts'), 'utf8');
    expect(shared).toMatch(/areaIds:\s*string\[\]/);
    expect(shared).toMatch(/merchantIds\?:/);
    expect(shared).toMatch(/ownerId\?:/);
  });

  it('API parseCampaign projects areaIds/merchantIds/ownerId (baseline)', async () => {
    const src = await readFile(
      path.resolve(__dirname, '../../../../../../apps/api/src/campaign/campaign.service.ts'),
      'utf8'
    );
    expect(src).toMatch(/areaIds:\s*safeJsonArray\(row\.areaIds\)/);
    expect(src).toMatch(/merchantIds:\s*safeJsonArray\(row\.merchantIds\)/);
    expect(src).toMatch(/ownerId:\s*row\.ownerId/);
  });

  it('create/edit form already writes areaIds + merchantIds (baseline # form)', async () => {
    const form = await readFile(path.join(__dirname, 'useCampaignForm.ts'), 'utf8');
    expect(form).toMatch(/areaIds:/);
    expect(form).toMatch(/merchantIds:/);

    const dialog = await readFile(
      path.join(__dirname, '../components/CampaignCreateDialog.vue'),
      'utf8'
    );
    expect(dialog).toMatch(/覆盖区域/);
    expect(dialog).toMatch(/关联商家/);
    expect(dialog).toMatch(/form\.areaIds/);
    expect(dialog).toMatch(/form\.merchantIds/);
  });
});
