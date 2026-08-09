import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → community-library → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #231 community form activityLevel', () => {
  it('community-library.api create/update accept activityLevel', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/community-library.api.ts'), 'utf8');
    expect(src).toMatch(/CommunityWritePayload/);
    expect(src).toMatch(/activityLevel\?:/);
    expect(src).toMatch(/ownerPhone\?:/);
    expect(src).toMatch(/note\?:/);
    expect(src).toMatch(/export async function createCommunity\(data: CommunityWritePayload\)/);
    expect(src).toMatch(
      /export async function updateCommunity\(id: string, data: Partial<CommunityWritePayload>\)/
    );
  });

  it('CommunityCreateDialog exposes activityLevel control', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/CommunityCreateDialog.vue'),
      'utf8'
    );
    expect(src).toMatch(/activityLevel/);
    expect(src).toMatch(/activityLevelOptions/);
    expect(src).toMatch(/value:\s*'high'/);
    expect(src).toMatch(/ownerPhone/);
    expect(src).toMatch(/note/);
  });

  it('CommunityLibraryView seeds activityLevel on edit + forwards on submit', async () => {
    const src = await readFile(path.join(srcRoot, 'views/CommunityLibraryView.vue'), 'utf8');
    expect(src).toMatch(/activityLevel:\s*''/);
    expect(src).toMatch(/communityForm\.activityLevel\s*=/);
    expect(src).toMatch(/activityLevel:\s*communityForm\.activityLevel\s*\|\|\s*undefined/);
    expect(src).toMatch(/toCommunityWritePayload/);
    expect(src).toMatch(/<ErrorAlert :message="writeError" \/>/);
    expect(src).toMatch(/saveCommunity\s*\(/);
    expect(src).toMatch(/importCommunities\s*\(/);
  });

  it('CreateCommunityDto already accepts activityLevel (API ready)', async () => {
    // composables → community-library → features → src → web → apps → monorepo
    const dtoPath = path.resolve(
      __dirname,
      '../../../../../../apps/api/src/community/dto/create-community.dto.ts'
    );
    const src = await readFile(dtoPath, 'utf8');
    expect(src).toMatch(/activityLevel\?:/);
    expect(src).toMatch(/@IsIn\(\['high',\s*'medium',\s*'low'\]\)/);
  });
});
