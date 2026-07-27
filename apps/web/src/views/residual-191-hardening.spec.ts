import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// views → src
const srcRoot = path.resolve(__dirname, '..');

describe('residual #191 user list shape normalize', () => {
  it('listUsers normalizes API { data } to items', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/user.api.ts'), 'utf8');
    const fnStart = src.indexOf('export async function listUsers');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('export async function getUser', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/Array\.isArray\(raw\.data\)/);
    expect(fn).toMatch(/items:\s*raw\.data/);
    expect(fn).toMatch(/Array\.isArray\(raw\.items\)/);
  });

  it('UserManagementView loader prefers items with data fallback', async () => {
    const src = await readFile(path.join(srcRoot, 'views/UserManagementView.vue'), 'utf8');
    // Residual #205/#208: loader now destructures filters too.
    expect(src).toMatch(/async \(\{\s*page,\s*pageSize,\s*filters/);
    expect(src).toMatch(/data\.items\s*\?\?\s*data\.data/);
    expect(src).toMatch(/api\.listUsers/);
  });

  it('API user.service list still returns data key (contract pin)', async () => {
    const src = await readFile(
      path.join(srcRoot, '../../api/src/user-access/user.service.ts'),
      'utf8'
    );
    // Signature grew keyword/isActive after #205/#208 — pin contract, not exact sig.
    expect(src).toMatch(/async list\s*\(/);
    expect(src).toMatch(/data:\s*users/);
    expect(src).not.toMatch(/items:\s*users/);
  });
});
