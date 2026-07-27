import { describe, expect, it } from 'vitest';

describe('residual #143 JWT/auth status projection (no full findById)', () => {
  it('UserService.findAuthStatus selects slim columns + role/scope only', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'user.service.ts'),
      'utf8'
    );

    // Residual #144: findAuthStatus delegates to loadAuthStatusByColumn.
    expect(src).toMatch(/async findAuthStatus\(userId: string\)/);
    expect(src).toMatch(/loadAuthStatusByColumn\('userId', userId\)/);

    const fnStart = src.indexOf('private async loadAuthStatusByColumn');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  /**\n   * Residual #115', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 1500);

    expect(fn).toMatch(/SELECT "userId", "username", "isActive", "tokenVersion"/);
    expect(fn).toMatch(/SELECT "role", "scopeType", "scopeId" FROM "UserRoleBinding"/);
    // Must not pull PII / list columns.
    expect(fn).not.toMatch(/USER_AUTH_COLUMNS|USER_LIST_COLUMNS/);
    expect(fn).not.toMatch(/"email"|"phone"|"displayName"|"lastLoginAt"/);
    // Must not use full fetchRoleBindings (binding id + createdAt unused by JWT).
    expect(fn).not.toMatch(/fetchRoleBindings|mapUser/);
  });

  it('JwtStrategy.resolveStatus uses findAuthStatus (not findById)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'auth', 'jwt.strategy.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('private async resolveStatus(');
    expect(fnStart).toBeGreaterThan(0);
    const fn = src.slice(fnStart, fnStart + 1200);

    expect(fn).toMatch(/findAuthStatus\(/);
    expect(fn).not.toMatch(/findById\(/);
  });

  it('AuthService refresh/localSession use findAuthStatus for DB user', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'auth', 'auth.service.ts'),
      'utf8'
    );

    const localStart = src.indexOf('async localSession(');
    expect(localStart).toBeGreaterThan(0);
    const refreshStart = src.indexOf('async refresh(');
    expect(refreshStart).toBeGreaterThan(0);
    const local = src.slice(localStart, refreshStart > 0 ? refreshStart : localStart + 1200);
    const refreshEnd = src.indexOf('private signUserToken', refreshStart + 10);
    const refresh = src.slice(refreshStart, refreshEnd > 0 ? refreshEnd : refreshStart + 1200);

    expect(local).toMatch(/findAuthStatus\('admin'\)/);
    expect(local).not.toMatch(/findById\(/);
    expect(refresh).toMatch(/findAuthStatus\(payload\.sub\)/);
    expect(refresh).not.toMatch(/findById\(/);
  });
});
