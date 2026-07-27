import { describe, expect, it } from 'vitest';

describe('residual #145 validateUser slim auth projection', () => {
  it('validateUser SELECTs only auth fields + passwordHash (no PII/list columns)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'user.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async validateUser(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  /**\n   * Fetch public user profile', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 2500);

    // Residual #145: slim SELECT for login JWT mint.
    expect(fn).toMatch(/SELECT "userId", "username", "isActive", "tokenVersion", "passwordHash"/);
    expect(fn).toMatch(/SELECT "role", "scopeType", "scopeId" FROM "UserRoleBinding"/);
    // Must not pull full USER_AUTH / list columns or mapUser/fetchRoleBindings.
    expect(fn).not.toMatch(/USER_AUTH_COLUMNS|USER_LIST_COLUMNS/);
    expect(fn).not.toMatch(/fetchRoleBindings|mapUser/);
    // AppUser SELECT must not include PII columns (lastLoginAt is still written on success).
    const appUserSelect = fn.match(
      /SELECT "userId", "username", "isActive", "tokenVersion", "passwordHash"[\s\S]*?FROM "AppUser"/
    );
    expect(appUserSelect).toBeTruthy();
    expect(appUserSelect![0]).not.toMatch(
      /"email"|"phone"|"displayName"|"lastLoginAt"|"createdAt"/
    );
    // Still pays bcrypt cost on miss/inactive and updates lastLoginAt on success.
    expect(fn).toMatch(/burnPasswordVerifyCost/);
    expect(fn).toMatch(/SET "lastLoginAt"/);
  });

  it('AuthService.login still uses validateUser then signUserToken', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'auth', 'auth.service.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('async login(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async localSession(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 800);
    expect(fn).toMatch(/validateUser\(/);
    expect(fn).toMatch(/signUserToken\(user\)/);
  });
});
