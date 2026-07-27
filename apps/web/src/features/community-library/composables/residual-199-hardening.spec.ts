import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → community-library → features → src
const srcRoot = path.resolve(__dirname, '../../..');
const apiRoot = path.resolve(srcRoot, '../../api/src');

describe('residual #199 community re-enable after soft-disable', () => {
  it('API service enable flips isActive to 1 with slim shell', async () => {
    const src = await readFile(path.join(apiRoot, 'community/community.service.ts'), 'utf8');
    const fnStart = src.indexOf('async enable(id: string)');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('async getPerformance', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/"isActive"\s*=\s*1/);
    expect(fn).toMatch(/isActive:\s*true/);
    expect(fn).toMatch(/NotFoundException/);
  });

  it('API controller exposes POST :id/enable with same roles as disable', async () => {
    const src = await readFile(path.join(apiRoot, 'community/community.controller.ts'), 'utf8');
    expect(src).toMatch(/@Post\(['"]:id\/enable['"]\)/);
    const fnStart = src.indexOf("async enable(@Param('id')");
    expect(fnStart).toBeGreaterThanOrEqual(0);
    // Roles decorator appears above enable (same admin/platform_operator).
    const blockStart = src.lastIndexOf('@Roles', fnStart);
    expect(blockStart).toBeGreaterThanOrEqual(0);
    const blockEnd = src.indexOf('async getPerformance', fnStart + 10);
    const block = src.slice(blockStart, blockEnd > 0 ? blockEnd : undefined);
    expect(block).toMatch(/admin/);
    expect(block).toMatch(/platform_operator/);
    expect(block).toMatch(/assertCommunityAccess/);
    expect(block).toMatch(/this\.svc\.enable/);
  });

  it('SPA client enableCommunity posts /enable and clears cache', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/community-library.api.ts'), 'utf8');
    const fnStart = src.indexOf('export async function enableCommunity');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('export async function getCommunityPerformance', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/\/enable/);
    expect(fn).toMatch(/clearCache\(['"]\/community-library['"]\)/);
  });

  it('useCommunityLibrary exposes handleEnable calling enableCommunity', async () => {
    const src = await readFile(path.join(__dirname, 'useCommunityLibrary.ts'), 'utf8');
    expect(src).toMatch(/handleEnable/);
    expect(src).toMatch(/async function enableCommunity/);
    expect(src).toMatch(/api\.enableCommunity/);
  });

  it('CommunityLibraryTable emits enable for inactive rows', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/CommunityLibraryTable.vue'),
      'utf8'
    );
    expect(src).toMatch(/emit\(['"]enable['"]/);
    expect(src).toMatch(/启用/);
    expect(src).toMatch(/enable:\s*\[community/);
  });

  it('CommunityLibraryView wires @enable to handleEnable', async () => {
    const src = await readFile(path.join(srcRoot, 'views/CommunityLibraryView.vue'), 'utf8');
    expect(src).toMatch(/@enable="handleEnable"/);
    expect(src).toMatch(/handleEnable/);
  });
});
