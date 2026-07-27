import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');
const sharedRoot = path.join(__dirname, '..', '..', '..', 'packages', 'shared', 'src');

describe('residual #276 campaign list startDate span honesty', () => {
  it('list projects startDateFrom/startDateTo when date filter active', async () => {
    const src = await readFile(path.join(srcRoot, 'campaign', 'campaign.service.ts'), 'utf8');
    const start = src.indexOf('async list(');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('async getById(', start + 10);
    const fn = src.slice(start, end > 0 ? end : start + 5000);
    expect(fn).toMatch(/effectiveSpan/);
    expect(fn).toMatch(/resolveInteractiveDateSpan/);
    expect(fn).toMatch(/startDateFrom:\s*effectiveSpan\.dateFrom/);
    expect(fn).toMatch(/startDateTo:\s*effectiveSpan\.dateTo/);
    // Default list (no date filter) omits span.
    expect(fn).toMatch(/\.\.\.\(effectiveSpan\s*\?/);
  });

  it('controller emptyScope projects startDate span when filtered', async () => {
    const src = await readFile(path.join(srcRoot, 'campaign', 'campaign.controller.ts'), 'utf8');
    expect(src).toMatch(/resolveInteractiveDateSpan/);
    expect(src).toMatch(/startDateFrom:\s*span\.dateFrom/);
    expect(src).toMatch(/startDateTo:\s*span\.dateTo/);
  });

  it('shared CampaignListResponse declares startDateFrom/startDateTo', async () => {
    const src = await readFile(path.join(sharedRoot, 'api-campaign-types.ts'), 'utf8');
    const start = src.indexOf('export interface CampaignListResponse');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('export interface', start + 10);
    const block = src.slice(start, end > 0 ? end : start + 800);
    expect(block).toMatch(/startDateFrom\?:/);
    expect(block).toMatch(/startDateTo\?:/);
  });

  it('SPA sinks effective span + shows list-window-hint', async () => {
    const useCampaigns = await readFile(
      path.join(webRoot, 'features', 'campaigns', 'composables', 'useCampaigns.ts'),
      'utf8'
    );
    expect(useCampaigns).toMatch(/listStartDateFrom/);
    expect(useCampaigns).toMatch(/listStartDateTo/);
    expect(useCampaigns).toMatch(/windowLabel/);
    expect(useCampaigns).toMatch(/data\.startDateFrom/);
    expect(useCampaigns).toMatch(/data\.startDateTo/);

    const view = await readFile(path.join(webRoot, 'views', 'CampaignsView.vue'), 'utf8');
    expect(view).toMatch(/list-window-hint/);
    expect(view).toMatch(/windowLabel/);
    expect(view).toMatch(/开始日筛选已按交互查询上限收束/);
  });
});
