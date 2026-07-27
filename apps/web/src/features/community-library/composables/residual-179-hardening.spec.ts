import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → community-library → features → src
const srcRoot = path.resolve(__dirname, '../../..');
// apps/web/src → web → apps → monorepo root → packages/shared/src
const sharedRoot = path.resolve(srcRoot, '../../../packages/shared/src');

describe('residual #179 community detail performance + view wire-up', () => {
  it('shared exports CommunityPerformanceResponse matching API shape', async () => {
    const src = await readFile(path.join(sharedRoot, 'api-campaign-types.ts'), 'utf8');
    expect(src).toMatch(/export interface CommunityPerformanceResponse/);
    for (const field of [
      'totalTasks',
      'completedTasks',
      'failedTasks',
      'totalGmv',
      'dateFrom',
      'dateTo'
    ]) {
      expect(src).toMatch(new RegExp(`${field}\\s*:`));
    }
    // Community aggregate has no totalOrders (TPD gmv only) — pin difference from campaign.
    const ifaceStart = src.indexOf('export interface CommunityPerformanceResponse');
    expect(ifaceStart).toBeGreaterThanOrEqual(0);
    const ifaceEnd = src.indexOf('export interface', ifaceStart + 10);
    const iface = src.slice(ifaceStart, ifaceEnd > 0 ? ifaceEnd : undefined);
    expect(iface).not.toMatch(/totalOrders/);
  });

  it('community-library.api getCommunityPerformance is CommunityPerformanceResponse', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/community-library.api.ts'), 'utf8');
    const fnStart = src.indexOf('export async function getCommunityPerformance');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fn = src.slice(fnStart);
    expect(fn).toMatch(/cachedGet\s*<\s*CommunityPerformanceResponse\s*>/);
    // Import must pull the community-scoped type (not visit-rate shape).
    expect(src).toMatch(/CommunityPerformanceResponse/);
    expect(src).not.toMatch(/TaskPerformanceResponse/);
  });

  it('CommunityDetailCard binds community performance fields (not visits/rates)', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/CommunityDetailCard.vue'),
      'utf8'
    );
    expect(src).toMatch(/CommunityPerformanceResponse/);
    expect(src).not.toMatch(/TaskPerformanceResponse/);
    // Old visit/order rate fields must not appear as property access.
    expect(src).not.toMatch(
      /performance\.visits|performance\.orders|performance\.conversionRate|performance\.verifyRate|performance\.refundRate|performance\.gmv\b/
    );
    for (const field of ['totalTasks', 'completedTasks', 'failedTasks', 'totalGmv']) {
      // VNext §7.4.5：允许迁移后的 displayMoney(performance, '<field>') 形态。
      expect(src).toMatch(new RegExp(`(performance\\.${field}|displayMoney\\(performance, '${field}'\\))`));
    }
  });

  it('useCommunityDetail open fetches getCommunity + getCommunityPerformance', async () => {
    const src = await readFile(path.join(__dirname, 'useCommunityDetail.ts'), 'utf8');
    expect(src).toMatch(/CommunityPerformanceResponse/);
    expect(src).toMatch(/api\.getCommunity\s*\(/);
    expect(src).toMatch(/api\.getCommunityPerformance\s*\(/);
    expect(src).toMatch(/Promise\.all/);
  });

  it('CommunityLibraryView handleView opens detail (not pure no-op)', async () => {
    const src = await readFile(path.join(srcRoot, 'views/CommunityLibraryView.vue'), 'utf8');
    // Drawer + card mounted.
    expect(src).toMatch(/CommunityDetailCard/);
    expect(src).toMatch(/el-drawer/);
    expect(src).toMatch(/useCommunityDetail/);
    // handleView must call open.
    const viewStart = src.indexOf('function handleView');
    expect(viewStart).toBeGreaterThan(0);
    const viewEnd = src.indexOf('\nfunction ', viewStart + 10);
    const fn = src.slice(viewStart, viewEnd > 0 ? viewEnd : undefined);
    expect(fn).toMatch(/openDetail\s*\(/);
    // Must not be empty body / pure comment no-op.
    expect(fn).not.toMatch(/Could navigate to detail page in the future/);
  });
});
