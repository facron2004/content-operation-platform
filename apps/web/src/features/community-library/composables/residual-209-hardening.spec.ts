import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → community-library → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #209 community detail today recommendations', () => {
  it('community.api exposes getCommunityRecommendations hitting /content/communities/:id', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/community.api.ts'), 'utf8');
    expect(src).toMatch(/export async function getCommunityRecommendations/);
    expect(src).toMatch(/\/content\/communities\/\$\{encodeURIComponent\(groupId\)\}/);
  });

  it('useCommunityDetail open also fetches getCommunityRecommendations independently', async () => {
    const src = await readFile(path.join(__dirname, 'useCommunityDetail.ts'), 'utf8');
    expect(src).toMatch(/api\.getCommunityRecommendations\s*\(/);
    expect(src).toMatch(/Promise\.allSettled/);
    expect(src).toMatch(/packagesError\.value/);
    expect(src).toMatch(/packages\.value/);
    expect(src).toMatch(/packagesLoading/);
    // Prefer top-level packages, fall back to group.todayRecommendedPackages.
    expect(src).toMatch(/recs\.packages/);
    expect(src).toMatch(/todayRecommendedPackages/);
    expect(src).toMatch(/Promise\.all/);
  });

  it('CommunityDetailCard renders packages section via CommunityPackageList', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/CommunityDetailCard.vue'),
      'utf8'
    );
    expect(src).toMatch(/packages-section/);
    expect(src).toMatch(/CommunityPackageList/);
    expect(src).toMatch(/今日推荐套餐/);
    expect(src).toMatch(/packages\?:/);
    expect(src).toMatch(/packagesLoading/);
  });

  it('CommunityLibraryView wires packages props into detail card', async () => {
    const src = await readFile(path.join(srcRoot, 'views/CommunityLibraryView.vue'), 'utf8');
    expect(src).toMatch(/:packages="detailPackages"/);
    expect(src).toMatch(/:packages-loading="detailPackagesLoading"/);
    expect(src).toMatch(/packages:\s*detailPackages/);
    expect(src).toMatch(/packagesLoading:\s*detailPackagesLoading/);
  });
});
