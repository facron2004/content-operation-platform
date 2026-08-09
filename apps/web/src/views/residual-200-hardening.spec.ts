import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('residual #200 user re-activate CTA', () => {
  it('UserManagementView shows 启用 for inactive rows and calls updateUser isActive true', async () => {
    const src = await readFile(
      path.join(__dirname, '../features/user-management/UserTable.vue'),
      'utf8'
    );
    const composable = await readFile(
      path.join(__dirname, '../features/user-management/useUserManagement.ts'),
      'utf8'
    );
    expect(src).toMatch(/@click="\$emit\('activate', row\)"/);
    expect(src).toMatch(/v-else[\s\S]*?\$emit\('activate', row\)|启用/);
    expect(src).toMatch(/启用/);
    const fnStart = composable.indexOf('async function handleActivate');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = composable.indexOf('async function handleAccessSaved', fnStart + 10);
    const fn = composable.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/updateUser\([^,]+,\s*\{\s*isActive:\s*true\s*\}/);
    expect(fn).toMatch(/reloadCurrentPage/);
  });

  it('updateUser client already accepts isActive boolean', async () => {
    const src = await readFile(path.join(__dirname, '../services/api/user.api.ts'), 'utf8');
    const fnStart = src.indexOf('export async function updateUser');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('export async function deactivateUser', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/isActive\?:\s*boolean/);
  });
});
