import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// views → src
const srcRoot = path.resolve(__dirname, '..');
// monorepo root for api pins
const apiRoot = path.resolve(__dirname, '../../../../apps/api/src');

describe('residual #205 user list keyword filter end-to-end', () => {
  it('UserListQueryDto accepts keyword and controller passes it to service', async () => {
    const src = await readFile(path.join(apiRoot, 'user-access/user.controller.ts'), 'utf8');
    const dtoStart = src.indexOf('class UserListQueryDto');
    expect(dtoStart).toBeGreaterThanOrEqual(0);
    const dtoEnd = src.indexOf('@ApiTags', dtoStart + 10);
    const dto = src.slice(dtoStart, dtoEnd > 0 ? dtoEnd : undefined);
    expect(dto).toMatch(/keyword\?:\s*string/);
    expect(dto).toMatch(/@MaxLength\(100\)/);

    const listStart = src.indexOf('async listUsers');
    expect(listStart).toBeGreaterThanOrEqual(0);
    const listEnd = src.indexOf('async createUser', listStart + 10);
    const list = src.slice(listStart, listEnd > 0 ? listEnd : undefined);
    expect(list).toMatch(/query\.keyword/);
    expect(list).toMatch(/this\.userService\.list\(/);
  });

  it('user.service list applies LIKE ESCAPE on username/displayName/email/userId', async () => {
    const src = await readFile(path.join(apiRoot, 'user-access/user.service.ts'), 'utf8');
    const fnStart = src.indexOf('async list(');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    // Slice through create() so we cover COUNT + SELECT WHERE arms.
    const fnEnd = src.indexOf('async create(', fnStart + 30);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/likeContains/);
    expect(fn).toMatch(/LIKE \? ESCAPE/);
    expect(fn).toMatch(/"username"/);
    expect(fn).toMatch(/"displayName"/);
    expect(fn).toMatch(/"email"/);
    expect(fn).toMatch(/"userId"/);
    // COUNT and SELECT share the same whereSql.
    expect(fn).toMatch(/COUNT\(\*\)[\s\S]*\$\{whereSql\}/);
    expect(fn).toMatch(/FROM "AppUser" \$\{whereSql\}/);
  });

  it('UserManagementView wires keyword filter + listUsers keyword param', async () => {
    const src = await readFile(path.join(__dirname, 'UserManagementView.vue'), 'utf8');
    expect(src).toMatch(/filters\.keyword/);
    expect(src).toMatch(/user-filter-bar/);
    expect(src).toMatch(/搜索用户名/);
    expect(src).toMatch(/handleSearch/);
    expect(src).toMatch(/filterDebounceMs:\s*300/);
    // Loader must pass keyword to listUsers.
    const loaderStart = src.indexOf('async ({ page, pageSize, filters: f })');
    expect(loaderStart).toBeGreaterThanOrEqual(0);
    const loader = src.slice(loaderStart, loaderStart + 700);
    expect(loader).toMatch(/api\.listUsers/);
    expect(loader).toMatch(/keyword:\s*f\.keyword\.trim\(\)/);
  });

  it('listUsers client already accepts keyword query param', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/user.api.ts'), 'utf8');
    const fnStart = src.indexOf('export async function listUsers');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('export async function getUser', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/keyword\?:\s*string/);
    expect(fn).toMatch(/params/);
  });
});
