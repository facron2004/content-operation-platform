import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → community-library → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #196 community isActive 0|1 filter', () => {
  it('useCommunityLibrary coerces isActive boolean to 0|1', async () => {
    const src = await readFile(path.join(__dirname, 'useCommunityLibrary.ts'), 'utf8');
    const loadStart = src.indexOf('async ({ page, pageSize, filters })');
    expect(loadStart).toBeGreaterThan(0);
    const loadEnd = src.indexOf('onError', loadStart + 10);
    const load = src.slice(loadStart, loadEnd > 0 ? loadEnd : undefined);
    expect(load).toMatch(/isActiveParam|isActive\s*\?\s*1\s*:\s*0/);
    expect(load).toMatch(/isActive:\s*isActiveParam|isActive:\s*filters\.isActive\s*===/);
  });

  it('listCommunities client accepts number isActive', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/community-library.api.ts'), 'utf8');
    const fnStart = src.indexOf('export async function listCommunities');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('export async function getCommunity', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/isActive\?:\s*number/);
  });

  it('CommunityQueryDto still declares isActive as 0|1 number', async () => {
    const src = await readFile(
      path.join(srcRoot, '../../api/src/community/dto/community-query.dto.ts'),
      'utf8'
    );
    expect(src).toMatch(/isActive\?:/);
    expect(src).toMatch(/@Min\(0\)/);
    expect(src).toMatch(/@Max\(1\)/);
  });
});
