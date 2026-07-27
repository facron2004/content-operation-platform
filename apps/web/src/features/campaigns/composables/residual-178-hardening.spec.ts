import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → campaigns → features → src  (= apps/web/src)
const srcRoot = path.resolve(__dirname, '../../..');
// apps/web/src → web → apps → monorepo root → packages/shared/src
const sharedRoot = path.resolve(srcRoot, '../../../packages/shared/src');

describe('residual #178 campaign detail campaign-scoped performance', () => {
  it('shared exports CampaignPerformanceResponse matching API shape', async () => {
    const src = await readFile(path.join(sharedRoot, 'api-campaign-types.ts'), 'utf8');
    expect(src).toMatch(/export interface CampaignPerformanceResponse/);
    for (const field of [
      'totalTasks',
      'completedTasks',
      'failedTasks',
      'totalGmv',
      'totalOrders',
      'dateFrom',
      'dateTo'
    ]) {
      expect(src).toMatch(new RegExp(`${field}\\s*:`));
    }
  });

  it('campaign.api getCampaignPerformance is CampaignPerformanceResponse (not visit-rate shape)', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/campaign.api.ts'), 'utf8');
    const fnStart = src.indexOf('export async function getCampaignPerformance');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fn = src.slice(fnStart);
    expect(fn).toMatch(/cachedGet\s*<\s*CampaignPerformanceResponse\s*>/);
    // Assert call-site type only; residual comments may name the old shape.
    expect(fn).toMatch(/CampaignPerformanceResponse/);
    expect(src).toMatch(
      /import type \{\s*CampaignListResponse,\s*CampaignPerformanceResponse\s*\}/
    );
  });

  it('useCampaignDetail loadDetail uses getCampaignPerformance (not platform getTaskKPIs)', async () => {
    const src = await readFile(path.join(__dirname, 'useCampaignDetail.ts'), 'utf8');
    expect(src).toMatch(/CampaignPerformanceResponse/);
    expect(src).toMatch(/performance\s*=\s*ref\s*<\s*CampaignPerformanceResponse/);
    // Avoid residual comment false-positive: assert call site only.
    expect(src).not.toMatch(/api\.getTaskKPIs/);
    expect(src).toMatch(/api\.getCampaignPerformance\s*\(/);

    const loadStart = src.indexOf('async function loadDetail');
    expect(loadStart).toBeGreaterThan(0);
    const loadEnd = src.indexOf('\n  async function runAction', loadStart + 10);
    const loadFn = src.slice(loadStart, loadEnd > 0 ? loadEnd : undefined);
    expect(loadFn).toMatch(/api\.getCampaign\s*\(/);
    expect(loadFn).toMatch(/api\.getCampaignPerformance\s*\(/);
    expect(loadFn).toMatch(/Promise\.all/);
  });

  it('CampaignTaskSummary binds campaign performance fields', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/CampaignTaskSummary.vue'),
      'utf8'
    );
    expect(src).toMatch(/CampaignPerformanceResponse/);
    expect(src).toMatch(/performance:\s*CampaignPerformanceResponse\s*\|\s*null/);
    // Platform task-status KPI field names must not appear as property access.
    expect(src).not.toMatch(/todayPending|inProgress|todayTaskGmv/);
    for (const field of [
      'totalTasks',
      'completedTasks',
      'failedTasks',
      'totalOrders',
      'totalGmv'
    ]) {
      expect(src).toMatch(new RegExp(`p\\?\\.${field}`));
    }
  });

  it('CampaignDetailView wires performance prop (no duplicate mount fetch)', async () => {
    const src = await readFile(path.join(srcRoot, 'views/CampaignDetailView.vue'), 'utf8');
    expect(src).toMatch(/:performance="performance"/);
    expect(src).not.toMatch(/:kpis=/);
    // Destructure must expose performance, not the old platform KPI ref.
    expect(src).toMatch(/\bperformance\b/);
    expect(src).not.toMatch(/\bkpis\b/);
    // Composable already mounts the fetch; view script must not import/call onMounted.
    expect(src).not.toMatch(/import\s*\{\s*onMounted/);
    expect(src).not.toMatch(/onMounted\s*\(/);
  });
});
