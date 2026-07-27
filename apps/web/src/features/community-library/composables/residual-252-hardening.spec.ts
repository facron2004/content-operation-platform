import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('residual #252 community detail surfaces #236 write fields', () => {
  it('CommunityDetailCard shows preferredCategories / ownerPhone / note', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/CommunityDetailCard.vue'),
      'utf8'
    );
    expect(src).toMatch(/community\.preferredCategories/);
    expect(src).toMatch(/community\.ownerPhone/);
    expect(src).toMatch(/community\.note/);
    expect(src).toMatch(/偏好品类/);
    expect(src).toMatch(/负责人电话/);
    expect(src).toMatch(/备注/);
  });

  it('shared CommunityGroupEntity already declares residual fields (baseline #236)', async () => {
    const shared = await readFile(
      path.resolve(__dirname, '../../../../../../packages/shared/src/api-task-types.ts'),
      'utf8'
    );
    expect(shared).toMatch(/preferredCategories\?:/);
    expect(shared).toMatch(/ownerPhone\?:/);
    expect(shared).toMatch(/note\?:/);
  });

  it('API mapCommunity projects preferredCategories/ownerPhone/note (baseline)', async () => {
    const src = await readFile(
      path.resolve(__dirname, '../../../../../../apps/api/src/community/community.service.ts'),
      'utf8'
    );
    expect(src).toMatch(/preferredCategories:\s*safeJsonArray/);
    expect(src).toMatch(/ownerPhone:\s*maskPhone/);
    expect(src).toMatch(/note:\s*row\.note/);
  });
});
