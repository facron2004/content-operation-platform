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

  it('UserManagementView has role button + handleEditRoles', async () => {
    const src = await readFile(path.join(srcRoot, 'views/UserManagementView.vue'), 'utf8');
    expect(src).toMatch(/handleEditRoles/);
    expect(src).toMatch(/@click="handleEditRoles\(row\)"/);
    // Role dialog state.
    expect(src).toMatch(/rolesDialogVisible/);
    expect(src).toMatch(/roleDrafts/);
  });

  it('role submit calls api.updateUserRoles with scoped bindings', async () => {
    const src = await readFile(path.join(srcRoot, 'views/UserManagementView.vue'), 'utf8');
    const submitStart = src.indexOf('async function handleRolesSubmit');
    expect(submitStart).toBeGreaterThan(0);
    const submitEnd = src.indexOf('async function handleDeactivate', submitStart + 10);
    const submitFn = src.slice(submitStart, submitEnd > 0 ? submitEnd : undefined);
    expect(submitFn).toMatch(/api\.updateUserRoles\(/);
    // Residual #244: shared mapRoleDrafts forces scopeType + scopeId for scoped roles.
    expect(submitFn).toMatch(/mapRoleDrafts\(roleDrafts\.value\)/);
    expect(src).toMatch(/function mapRoleDrafts/);
    expect(src).toMatch(/scopeType:\s*expectedScopeType\(b\.role\)!/);
    expect(src).toMatch(/scopeId:\s*b\.scopeId!\.trim\(\)/);
  });

  it('validateRoleDrafts requires scopeId for area/merchant operators', async () => {
    const src = await readFile(path.join(srcRoot, 'views/UserManagementView.vue'), 'utf8');
    expect(src).toMatch(/SCOPED_ROLES/);
    expect(src).toMatch(/area_operator/);
    expect(src).toMatch(/merchant_operator/);
    const validateStart = src.indexOf('function validateRoleDrafts');
    expect(validateStart).toBeGreaterThan(0);
    const validateEnd = src.indexOf('async function handleRolesSubmit', validateStart + 10);
    const validateFn = src.slice(validateStart, validateEnd > 0 ? validateEnd : undefined);
    expect(validateFn).toMatch(/必须填写 scopeId/);
    expect(validateFn).toMatch(/needsScope\(b\.role\)/);
  });

  it('role tags render scopeId when present', async () => {
    const src = await readFile(path.join(srcRoot, 'views/UserManagementView.vue'), 'utf8');
    expect(src).toMatch(/formatRoleTag/);
    expect(src).toMatch(/\$\{label\}\(\$\{r\.scopeId\}\)/);
  });
});
