import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → community-library → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #258 community ownerPhone mask write-back + list surface', () => {
  it('handleEdit does not seed ownerPhone from masked list/detail row', async () => {
    const src = await readFile(path.join(srcRoot, 'views/CommunityLibraryView.vue'), 'utf8');
    const editStart = src.indexOf('function handleEdit');
    expect(editStart).toBeGreaterThan(0);
    const editEnd = src.indexOf('\nasync function', editStart + 10);
    const editFn = src.slice(editStart, editEnd > 0 ? editEnd : editStart + 1200);
    // Must seed empty phone (password leave-blank pattern / residual #257).
    expect(editFn).toMatch(/ownerPhone\s*=\s*['"]{2}/);
    // Must NOT seed from community.ownerPhone (maskPhone).
    expect(editFn).not.toMatch(/ownerPhone\s*=\s*community\.ownerPhone/);
  });

  it('toCommunityWritePayload only sends ownerPhone when non-empty', async () => {
    const src = await readFile(path.join(srcRoot, 'views/CommunityLibraryView.vue'), 'utf8');
    const fnStart = src.indexOf('function toCommunityWritePayload');
    expect(fnStart).toBeGreaterThan(0);
    const fnEnd = src.indexOf('\nasync function', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 800);
    // Empty optional → undefined so PATCH omits and keeps stored phone.
    expect(fn).toMatch(/ownerPhone:\s*communityForm\.ownerPhone\.trim\(\)\s*\|\|\s*undefined/);
  });

  it('CommunityCreateDialog edit placeholder documents leave-blank', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/CommunityCreateDialog.vue'),
      'utf8'
    );
    expect(src).toMatch(/留空则不修改（列表为脱敏值）/);
    expect(src).toMatch(/form\.ownerPhone/);
  });

  it('CommunityLibraryTable shows masked ownerPhone column', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/CommunityLibraryTable.vue'),
      'utf8'
    );
    expect(src).toMatch(/负责人电话/);
    expect(src).toMatch(/row\.ownerPhone/);
  });

  it('API mapCommunity still applies maskPhone (baseline)', async () => {
    const src = await readFile(
      path.resolve(__dirname, '../../../../../../apps/api/src/community/community.service.ts'),
      'utf8'
    );
    expect(src).toMatch(/ownerPhone:\s*maskPhone\(row\.ownerPhone\)/);
  });
});
