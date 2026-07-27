import { describe, expect, it } from 'vitest';

describe('residual #149 findById uses USER_LIST_COLUMNS (no tokenVersion)', () => {
  it('findById SELECTs list columns only; mutators are slim shells (#169)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'user.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async findById(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  /**\n   * Residual #143', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 600);

    expect(fn).toMatch(/SELECT \$\{USER_LIST_COLUMNS\} FROM "AppUser" WHERE "userId"/);
    expect(fn).not.toMatch(/USER_AUTH_COLUMNS/);
    expect(fn).toMatch(/fetchRoleBindings/);
    expect(fn).toMatch(/mapUser/);

    // Residual #169: mutators no longer hydrate full auth rows.
    const updateStart = src.indexOf('async update(');
    expect(updateStart).toBeGreaterThan(0);
    const privateStart = src.indexOf('\n  // ─── Private', updateStart);
    const mutators = src.slice(updateStart, privateStart > 0 ? privateStart : updateStart + 8000);
    expect(mutators).not.toMatch(/\bRETURNING\b/);
    expect(src).not.toMatch(/USER_AUTH_COLUMNS/);
  });

  it('controller publicUser still strips tokenVersion defense-in-depth', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'user.controller.ts'),
      'utf8'
    );
    expect(src).toMatch(/function publicUser/);
    expect(src).toMatch(/tokenVersion:\s*_hidden/);
    // create is slim shell (#170); list / get / me still strip tokenVersion.
    expect(src).toMatch(/publicUser\(user\)/);
    expect(src).not.toMatch(/publicUser\(created\)/);
  });
});
