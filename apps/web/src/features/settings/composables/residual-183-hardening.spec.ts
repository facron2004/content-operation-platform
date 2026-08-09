import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → settings → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #183 user edit SPA wire-up', () => {
  it('user.api updateUser accepts password + profile fields', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/user.api.ts'), 'utf8');
    const fnStart = src.indexOf('export async function updateUser');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('export async function deactivateUser', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/displayName\?/);
    expect(fn).toMatch(/email\?/);
    expect(fn).toMatch(/phone\?/);
    expect(fn).toMatch(/password\?/);
    expect(fn).toMatch(/\.patch\(`\/users\/\$\{encodeURIComponent\(id\)\}`/);
  });

  it('UserManagementView handleEdit opens dialog (not pure toast no-op)', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/user-management/useUserManagement.ts'),
      'utf8'
    );
    const editStart = src.indexOf('function handleEdit');
    expect(editStart).toBeGreaterThan(0);
    const editEnd = src.indexOf('function openAccess', editStart + 10);
    const editFn = src.slice(editStart, editEnd > 0 ? editEnd : undefined);
    // Must not be the pure "功能待完善" toast.
    expect(editFn).not.toMatch(/功能待完善/);
    expect(editFn).not.toMatch(/ElMessage\.info/);
    // Seeds form + opens dialog.
    expect(editFn).toMatch(/editingUser\.value\s*=\s*row/);
    expect(editFn).toMatch(/formVisible\.value\s*=\s*true/);
  });

  it('UserManagementView submit routes edit through api.updateUser', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/user-management/useUserManagement.ts'),
      'utf8'
    );
    expect(src).toMatch(/api\.updateUser\(/);
    // Capture the edited user id before awaiting so a late response cannot target another row.
    expect(src).toMatch(/const editingUserId = editingUser\.value\?\.userId/);
    expect(src).toMatch(/api\.updateUser\(editingUserId/);
    // Create path still uses createUser.
    expect(src).toMatch(/api\.createUser\(/);
    // Username disabled on edit (immutable).
    const form = await readFile(
      path.join(srcRoot, 'features/user-management/UserFormDialog.vue'),
      'utf8'
    );
    expect(form).toMatch(/:disabled="isEdit"/);
  });

  it('edit password validation is optional (≥8 only when provided)', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/user-management/UserFormDialog.vue'),
      'utf8'
    );
    // Create still requires password min 8.
    expect(src).toMatch(/required:\s*true,\s*min:\s*8/);
    // Edit uses custom validator that allows empty.
    expect(src).toMatch(/if \(!value \|\| !value\.trim\(\)\) return callback\(\)/);
    expect(src).toMatch(/密码至少 8 位/);
  });
});
