import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → src
const srcRoot = path.resolve(__dirname, '..');

describe('residual #232 package detail force-refresh', () => {
  it('package.api exposes refreshPackageDetail POST client', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/package.api.ts'), 'utf8');
    expect(src).toMatch(/export async function refreshPackageDetail/);
    expect(src).toMatch(/client\.post[\s\S]{0,120}detail\/refresh/);
    expect(src).toMatch(/clearCache\(/);
  });

  it('usePackageDetail.refreshDetail uses force-refresh POST, not re-GET', async () => {
    const src = await readFile(path.join(__dirname, 'usePackageDetail.ts'), 'utf8');
    expect(src).toMatch(/refreshDetail\s*=\s*async/);
    expect(src).toMatch(/api\.refreshPackageDetail\(/);
    // load path still uses GET.
    expect(src).toMatch(/api\.getPackageDetail\(/);
    // Pin: refreshDetail body assignment calls force-refresh, not getPackageDetail.
    expect(src).toMatch(/const refreshDetail[\s\S]{0,1200}api\.refreshPackageDetail\(/);
    // Ensure the only getPackageDetail call is the load path, not refresh.
    const refreshStart = src.indexOf('const refreshDetail');
    expect(refreshStart).toBeGreaterThan(-1);
    const refreshBody = src.slice(refreshStart, refreshStart + 1500);
    expect(refreshBody).toMatch(/refreshPackageDetail/);
    expect(refreshBody).not.toMatch(/getPackageDetail/);
  });

  it('PackageFeedPanel still exposes 刷新详情 affordance', async () => {
    const src = await readFile(path.join(srcRoot, 'components/PackageFeedPanel.vue'), 'utf8');
    expect(src).toMatch(/刷新详情/);
    expect(src).toMatch(/\$emit\('refresh'\)/);
  });

  it('API controller already has force-refresh POST (ready)', async () => {
    const dtoPath = path.resolve(
      __dirname,
      '../../../../apps/api/src/content/package-detail.controller.ts'
    );
    const src = await readFile(dtoPath, 'utf8');
    expect(src).toMatch(/@Post\('packages\/:packageId\/detail\/refresh'\)/);
    expect(src).toMatch(/forceRefresh:\s*true/);
  });
});
