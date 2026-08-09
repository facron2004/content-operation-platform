import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → settings → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #184 user role edit SPA wire-up', () => {
  it('user.api exposes updateUserRoles', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/user.api.ts'), 'utf8');
    expect(src).toMatch(/export async function updateUserRoles/);
    expect(src).toMatch(/\/users\/\$\{encodeURIComponent\(id\)\}\/roles/);
    expect(src).toMatch(/roles:\s*\{\s*role:\s*string/);
  });

  it('UserManagementView exposes an IAM access drawer from the user table', async () => {
    const page = await readFile(path.join(srcRoot, 'views/UserManagementView.vue'), 'utf8');
    const table = await readFile(
      path.join(srcRoot, 'features/user-management/UserTable.vue'),
      'utf8'
    );
    const drawer = await readFile(
      path.join(srcRoot, 'features/user-management/UserAccessDrawer.vue'),
      'utf8'
    );
    expect(page).toMatch(/UserAccessDrawer/);
    expect(table).toMatch(/@click="\$emit\('access', row\)"/);
    expect(drawer).toMatch(/el-tree/);
    expect(drawer).toMatch(/replaceIamUserAccess/);
    expect(drawer).toMatch(/ErrorAlert :message="loadErrorMessage"/);
    expect(drawer).toMatch(/重新加载授权/);
    expect(drawer).toMatch(/ErrorAlert :message="writeError"/);
  });

  it('access submit sends organization-backed scope bindings', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/user-management/UserAccessDrawer.vue'),
      'utf8'
    );
    expect(src).toMatch(/api\.replaceIamUserAccess\(/);
    expect(src).toMatch(/organizationUnitIds:\s*membershipDraft\.value/);
    expect(src).toMatch(/assignment\.orgUnitId/);
  });

  it('create-time compatibility roles still require scopeId for scoped operators', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/user-management/UserFormDialog.vue'),
      'utf8'
    );
    const types = await readFile(path.join(srcRoot, 'features/user-management/types.ts'), 'utf8');
    expect(types).toMatch(/merchant_operator/);
    expect(src).toMatch(/area_operator/);
    expect(src).toMatch(/必须填写 scopeId/);
    expect(src).toMatch(/needsScope\(binding\.role\)/);
  });

  it('role tags render scopeId when present', async () => {
    const src = await readFile(path.join(srcRoot, 'features/user-management/types.ts'), 'utf8');
    expect(src).toMatch(/formatRoleTag/);
    expect(src).toMatch(/\$\{label\}\(\$\{binding\.scopeId\}\)/);
  });
});
