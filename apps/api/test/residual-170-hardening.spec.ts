import { describe, expect, it } from 'vitest';

describe('residual #170 user create slim shell (drop mapUser synthesis)', () => {
  it('create returns slim success shell (no mapUser / PII / bindings on response)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'user.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async create(');
    expect(fnStart).toBeGreaterThan(0);
    const candidates = [
      src.indexOf('\n  async update(', fnStart + 10),
      src.indexOf('\n  /**\n   * Residual #169', fnStart + 10)
    ].filter((i) => i > 0);
    const next = candidates.length ? Math.min(...candidates) : fnStart + 2500;
    const fn = src.slice(fnStart, next);

    // Residual #170: slim shell — no mapUser synthesis on response.
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toMatch(/userId,/);
    expect(fn).toMatch(/username:/);
    expect(fn).not.toMatch(/return this\.mapUser\(/);
    expect(fn).not.toMatch(/createdBindings/);
    expect(fn).not.toMatch(/await this\.findById\(/);
    // Role bindings still written (multi-row #95).
    expect(fn).toMatch(/await this\.insertRoleBindings/);
    // Conflict path preserved.
    expect(fn).toMatch(/ConflictException/);
  });

  it('controller returns create slim shell without publicUser wrap', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'user.controller.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async createUser(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  @Get(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 500);

    expect(fn).toMatch(/return this\.userService\.create\(/);
    expect(fn).not.toMatch(/publicUser\(/);
    // list / get / me still strip tokenVersion.
    expect(src).toMatch(/function publicUser/);
    expect(src).toMatch(/publicUser\(user\)/);
  });
});
