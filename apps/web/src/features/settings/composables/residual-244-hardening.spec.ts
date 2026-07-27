import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → settings → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #244 createUser roles on create', () => {
  it('createUser client accepts roles bindings', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/user.api.ts'), 'utf8');
    const createStart = src.indexOf('export async function createUser');
    expect(createStart).toBeGreaterThan(-1);
    const createEnd = src.indexOf('export async function updateUser', createStart + 10);
    const createBody = src.slice(createStart, createEnd > 0 ? createEnd : undefined);
    expect(createBody).toMatch(/roles\?:\s*\{\s*role:\s*string/);
    expect(createBody).toMatch(/scopeType\?:/);
    expect(createBody).toMatch(/scopeId\?:/);
  });

  it('UserManagementView create dialog exposes createRoleDrafts controls', async () => {
    const src = await readFile(path.join(srcRoot, 'views/UserManagementView.vue'), 'utf8');
    expect(src).toMatch(/createRoleDrafts/);
    expect(src).toMatch(/addCreateRoleRow/);
    expect(src).toMatch(/removeCreateRoleRow/);
    expect(src).toMatch(/validateCreateRoleDrafts/);
    // Create-only (not on edit).
    expect(src).toMatch(/v-if="!isEdit"/);
  });

  it('create submit maps roles into api.createUser', async () => {
    const src = await readFile(path.join(srcRoot, 'views/UserManagementView.vue'), 'utf8');
    const submitStart = src.indexOf('async function handleSubmit');
    expect(submitStart).toBeGreaterThan(0);
    const submitEnd = src.indexOf('onMounted', submitStart + 10);
    const submitFn = src.slice(submitStart, submitEnd > 0 ? submitEnd : undefined);
    expect(submitFn).toMatch(/validateCreateRoleDrafts/);
    expect(submitFn).toMatch(/mapRoleDrafts\(createRoleDrafts\.value\)/);
    expect(submitFn).toMatch(/api\.createUser\([\s\S]{0,400}roles/);
  });

  it('openCreate seeds a default executor role draft', async () => {
    const src = await readFile(path.join(srcRoot, 'views/UserManagementView.vue'), 'utf8');
    const openStart = src.indexOf('function openCreate');
    expect(openStart).toBeGreaterThan(0);
    const openEnd = src.indexOf('function handleEdit', openStart + 10);
    const openFn = src.slice(openStart, openEnd > 0 ? openEnd : undefined);
    expect(openFn).toMatch(/createRoleDrafts\.value\s*=\s*\[\s*\{\s*role:\s*'executor'\s*\}\s*\]/);
  });

  it('CreateUserDto already accepts roles (API ready)', async () => {
    const dtoPath = path.resolve(
      __dirname,
      '../../../../../../apps/api/src/user-access/dto/create-user.dto.ts'
    );
    const src = await readFile(dtoPath, 'utf8');
    expect(src).toMatch(/roles\?:\s*RoleBindingDto\[\]/);
  });
});
