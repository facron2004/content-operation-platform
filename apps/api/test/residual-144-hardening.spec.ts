import { describe, expect, it } from 'vitest';

describe('residual #144 auth cold-start / localSession slim', () => {
  it('login env-admin path only probes hasAnyUsers (no full findByUsername/findById)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'auth', 'auth.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async login(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async localSession(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 1500);

    // Residual #144: cold-start gate is a single hasAnyUsers probe.
    expect(fn).toMatch(/hasAnyUsers\(/);
    expect(fn).not.toMatch(/findByUsername\(/);
    expect(fn).not.toMatch(/findById\(/);
    // Still prefers validateUser first.
    expect(fn).toMatch(/validateUser\(/);
  });

  it('localSession uses findAuthStatus / findAuthStatusByUsername (no findByUsername)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'auth', 'auth.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async localSession(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async refresh(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 1200);

    expect(fn).toMatch(/findAuthStatus\('admin'\)/);
    expect(fn).toMatch(/findAuthStatusByUsername\(ADMIN_USERNAME\)/);
    expect(fn).not.toMatch(/findByUsername\(/);
    expect(fn).not.toMatch(/findById\(/);
  });

  it('UserService exposes findAuthStatusByUsername sharing slim projection', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'user.service.ts'),
      'utf8'
    );

    expect(src).toMatch(/async findAuthStatusByUsername\(/);
    expect(src).toMatch(/private async loadAuthStatusByColumn\(/);
    const fnStart = src.indexOf('private async loadAuthStatusByColumn');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  /**\n   * Residual #115', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 1200);
    expect(fn).toMatch(/SELECT "userId", "username", "isActive", "tokenVersion"/);
    expect(fn).toMatch(/SELECT "role", "scopeType", "scopeId"/);
    expect(fn).not.toMatch(/USER_AUTH_COLUMNS|fetchRoleBindings|mapUser/);
  });
});
