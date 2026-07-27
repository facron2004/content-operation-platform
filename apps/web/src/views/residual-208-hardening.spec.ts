import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// views → src
const srcRoot = path.resolve(__dirname, '..');
const apiRoot = path.resolve(__dirname, '../../../../apps/api/src');

describe('residual #208 user list isActive filter end-to-end', () => {
  it('UserListQueryDto accepts isActive 0|1 and controller passes opts', async () => {
    const src = await readFile(path.join(apiRoot, 'user-access/user.controller.ts'), 'utf8');
    const dtoStart = src.indexOf('class UserListQueryDto');
    expect(dtoStart).toBeGreaterThanOrEqual(0);
    const dtoEnd = src.indexOf('@ApiTags', dtoStart + 10);
    const dto = src.slice(dtoStart, dtoEnd > 0 ? dtoEnd : undefined);
    expect(dto).toMatch(/isActive\?:\s*number/);
    expect(dto).toMatch(/@Min\(0\)/);
    expect(dto).toMatch(/@Max\(1\)/);

    const listStart = src.indexOf('async listUsers');
    expect(listStart).toBeGreaterThanOrEqual(0);
    const listEnd = src.indexOf('async createUser', listStart + 10);
    const list = src.slice(listStart, listEnd > 0 ? listEnd : undefined);
    expect(list).toMatch(/isActive:\s*query\.isActive/);
    expect(list).toMatch(/keyword:\s*query\.keyword/);
  });

  it('user.service list filters isActive = 0|1 with COUNT sharing WHERE', async () => {
    const src = await readFile(path.join(apiRoot, 'user-access/user.service.ts'), 'utf8');
    const fnStart = src.indexOf('async list(');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('async create(', fnStart + 30);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/isActive\?:\s*number/);
    expect(fn).toMatch(/"isActive"\s*=\s*\?/);
    expect(fn).toMatch(/filters\.isActive\s*===\s*0\s*\|\|\s*filters\.isActive\s*===\s*1/);
  });

  it('UserManagementView coerces isActive boolean to 0|1 and exposes select', async () => {
    const src = await readFile(path.join(__dirname, 'UserManagementView.vue'), 'utf8');
    expect(src).toMatch(/filters\.isActive/);
    expect(src).toMatch(/filter-status|状态/);
    expect(src).toMatch(/el-option[^>]*label="启用"/);
    expect(src).toMatch(/el-option[^>]*label="停用"/);
    const loaderStart = src.indexOf('async ({ page, pageSize, filters: f })');
    expect(loaderStart).toBeGreaterThanOrEqual(0);
    const loader = src.slice(loaderStart, loaderStart + 500);
    expect(loader).toMatch(/isActiveParam/);
    expect(loader).toMatch(/isActive:\s*isActiveParam/);
    expect(loader).toMatch(/f\.isActive\s*\?\s*1\s*:\s*0/);
  });

  it('listUsers client accepts isActive number param', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/user.api.ts'), 'utf8');
    const fnStart = src.indexOf('export async function listUsers');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('export async function getUser', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/isActive\?:\s*number/);
  });
});
