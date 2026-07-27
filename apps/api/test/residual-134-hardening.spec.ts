import { describe, expect, it } from 'vitest';

describe('residual #134 user create (superseded by #170 slim shell)', () => {
  it('create returns slim shell; insertRoleBindings still returns bindings for write path', async () => {
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

    // Residual #170: slim shell — no mapUser / findById on create response.
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toMatch(/userId/);
    expect(fn).not.toMatch(/return this\.mapUser\(/);
    expect(fn).not.toMatch(/await this\.findById\(userId\)/);
    expect(fn).not.toMatch(/Failed to load created user/);
    // Bindings still written via multi-row insert.
    expect(fn).toMatch(/await this\.insertRoleBindings/);

    // insertRoleBindings still returns UserRoleBinding[] (write-path helper).
    const insertStart = src.indexOf('private async insertRoleBindings(');
    expect(insertStart).toBeGreaterThan(0);
    const insertNext = src.indexOf('\n  private async fetchRoleBindings(', insertStart + 10);
    const insertFn = src.slice(insertStart, insertNext > 0 ? insertNext : insertStart + 800);
    expect(insertFn).toMatch(/Promise<UserRoleBinding\[\]>/);
    expect(insertFn).toMatch(/return bindings/);
  });

  it('update/deactivate/updateRoles use slim shells (no post-write findById)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'user.service.ts'),
      'utf8'
    );

    // Residual #169: all three mutators return slim shells (no free-form payload).
    for (const fnName of ['async update(', 'async deactivate(', 'async updateRoles('] as const) {
      const fnStart = src.indexOf(fnName);
      expect(fnStart).toBeGreaterThan(0);
      const candidates = [
        src.indexOf('\n  async ', fnStart + 10),
        src.indexOf('\n  /**', fnStart + 10),
        src.indexOf('\n  // ─── Private', fnStart + 10)
      ].filter((i) => i > 0);
      const next = candidates.length ? Math.min(...candidates) : fnStart + 2500;
      const fn = src.slice(fnStart, next);
      expect(fn).toMatch(/success:\s*true/);
      expect(fn).not.toMatch(/\bRETURNING\b/);
      expect(fn).not.toMatch(/await this\.findById\(/);
    }
  });
});
