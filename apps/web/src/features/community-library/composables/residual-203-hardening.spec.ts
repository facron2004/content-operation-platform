import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → community-library → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #203 community areaId filter UI', () => {
  it('CommunityFilterBar exposes areaId input and resets it', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/CommunityFilterBar.vue'),
      'utf8'
    );
    expect(src).toMatch(/local\.areaId/);
    expect(src).toMatch(/区域 ID|区域ID/);
    expect(src).toMatch(/local\.areaId\s*=\s*['"]['"]/);
  });

  it('useCommunityLibrary already passes areaId to listCommunities', async () => {
    const src = await readFile(path.join(__dirname, 'useCommunityLibrary.ts'), 'utf8');
    expect(src).toMatch(/areaId:\s*filters\.areaId/);
  });

  it('listCommunities client accepts areaId', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/community-library.api.ts'), 'utf8');
    const fnStart = src.indexOf('export async function listCommunities');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('export async function getCommunity', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/areaId\?/);
  });
});
