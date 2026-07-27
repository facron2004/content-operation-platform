import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → community-library → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #236 community form remaining DTO fields', () => {
  it('community-library.api already accepts areaName/ownerName/preferredCategories', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/community-library.api.ts'), 'utf8');
    expect(src).toMatch(/CommunityWritePayload/);
    expect(src).toMatch(/areaName\?:/);
    expect(src).toMatch(/ownerName\?:/);
    expect(src).toMatch(/preferredCategories\?:/);
  });

  it('CommunityCreateDialog exposes areaName/ownerName/preferredCategories controls', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/CommunityCreateDialog.vue'),
      'utf8'
    );
    expect(src).toMatch(/form\.areaName/);
    expect(src).toMatch(/form\.ownerName/);
    expect(src).toMatch(/form\.preferredCategories/);
    expect(src).toMatch(/preferredCategories:\s*string\[\]/);
  });

  it('CommunityLibraryView seeds + forwards residual fields', async () => {
    const src = await readFile(path.join(srcRoot, 'views/CommunityLibraryView.vue'), 'utf8');
    expect(src).toMatch(/areaName:\s*''/);
    expect(src).toMatch(/ownerName:\s*''/);
    expect(src).toMatch(/preferredCategories:\s*\[\]\s*as string\[\]/);
    expect(src).toMatch(/communityForm\.areaName\s*=/);
    expect(src).toMatch(/communityForm\.ownerName\s*=/);
    expect(src).toMatch(/communityForm\.preferredCategories\s*=/);
    expect(src).toMatch(/areaName:\s*communityForm\.areaName\.trim\(\)\s*\|\|\s*undefined/);
    expect(src).toMatch(/ownerName:\s*communityForm\.ownerName\.trim\(\)\s*\|\|\s*undefined/);
    expect(src).toMatch(/preferredCategories:\s*\n?\s*communityForm\.preferredCategories\.length/);
  });

  it('CreateCommunityDto already accepts residual fields (API ready)', async () => {
    const dtoPath = path.resolve(
      __dirname,
      '../../../../../../apps/api/src/community/dto/create-community.dto.ts'
    );
    const src = await readFile(dtoPath, 'utf8');
    expect(src).toMatch(/areaName\?:/);
    expect(src).toMatch(/ownerName\?:/);
    expect(src).toMatch(/preferredCategories\?:/);
  });

  it('shared CommunityGroupEntity includes preferredCategories for edit seed', async () => {
    const shared = await readFile(
      path.resolve(__dirname, '../../../../../../packages/shared/src/api-task-types.ts'),
      'utf8'
    );
    expect(shared).toMatch(/preferredCategories\?:/);
  });
});
