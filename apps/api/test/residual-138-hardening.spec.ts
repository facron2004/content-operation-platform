import { describe, expect, it } from 'vitest';

describe('residual #138 user updateRoles (superseded by #169 slim shell)', () => {
  it('updateRoles uses insertRoleBindings + $executeRawUnsafe slim shell', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'user.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async updateRoles(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  // ─── Private', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 2500);

    // Residual #169: insertRoleBindings for write; slim shell (no mapUser).
    expect(fn).toMatch(/await this\.insertRoleBindings/);
    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).not.toMatch(/\bRETURNING\b/);
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toMatch(/userId:/);
    // No post-transaction findById / fetchRoleBindings / mapUser on happy path.
    expect(fn).not.toMatch(/await this\.findById\(id\)/);
    expect(fn).not.toMatch(/await this\.fetchRoleBindings/);
    expect(fn).not.toMatch(/return this\.mapUser\(/);
  });
});
