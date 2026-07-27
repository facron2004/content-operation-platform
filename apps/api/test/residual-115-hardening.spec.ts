import { describe, expect, it } from 'vitest';

describe('residual #115 user peer-gate slim', () => {
  it('service exposes hasUnrestrictedPeerRole (UserRoleBinding role-only SELECT)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'user.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async hasUnrestrictedPeerRole(userId: string)');
    expect(fnStart).toBeGreaterThan(0);
    const fn = src.slice(fnStart, fnStart + 550);
    expect(fn).toMatch(/SELECT "role" FROM "UserRoleBinding"/);
    expect(fn).toMatch(/'admin',\s*'platform_operator',\s*'auditor'/);
    expect(fn).toMatch(/LIMIT 1/);
    // Must not load full AppUser auth columns for the peer gate.
    expect(fn).not.toMatch(/USER_AUTH_COLUMNS|fetchRoleBindings|mapUser/);
  });

  it('assertCanMutateTarget uses hasUnrestrictedPeerRole (not full findById)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'user.controller.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('private async assertCanMutateTarget(');
    expect(fnStart).toBeGreaterThan(0);
    const fn = src.slice(fnStart, fnStart + 450);

    expect(fn).toMatch(/this\.userService\.hasUnrestrictedPeerRole\(targetId\)/);
    expect(fn).not.toMatch(/this\.userService\.findById\s*\(/);
  });
});
