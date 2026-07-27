import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #195 create/edit dialog write-back + campaignType PATCH', () => {
  it('TaskCreateDialog binds parent form in place (no localForm clone)', async () => {
    const src = await readFile(path.join(__dirname, '../components/TaskCreateDialog.vue'), 'utf8');
    expect(src).not.toMatch(/localForm/);
    expect(src).toMatch(/v-model="form\./);
    expect(src).toMatch(/emit\('submit'\)/);
    // Must not emit submit with a cloned payload the parent ignores.
    expect(src).not.toMatch(/emit\('submit',\s*localForm\)/);
  });

  it('CampaignCreateDialog binds parent form in place (no localForm clone)', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/campaigns/components/CampaignCreateDialog.vue'),
      'utf8'
    );
    expect(src).not.toMatch(/localForm/);
    expect(src).toMatch(/v-model="form\./);
    expect(src).toMatch(/emit\('submit'\)/);
    expect(src).not.toMatch(/emit\('submit',\s*localForm\)/);
  });

  it('useCampaignForm update payload includes campaignType', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/campaigns/composables/useCampaignForm.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('async function submit');
    expect(fnStart).toBeGreaterThan(0);
    const fnEnd = src.indexOf('\n  if (existing)', fnStart + 10);
    const altEnd = src.indexOf('\n  return {', fnStart + 10);
    const end = fnEnd > 0 ? fnEnd : altEnd > 0 ? altEnd : fnStart + 2500;
    const fn = src.slice(fnStart, end);
    // Update branch must send campaignType (create already did).
    expect(fn).toMatch(/api\.updateCampaign\([\s\S]*campaignType:\s*form\.campaignType/);
  });
});
