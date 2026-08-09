import { describe, expect, it } from 'vitest';

describe('residual #95 UserRoleBinding multi-row INSERT', () => {
  it('insertRoleBindings builds multi-row VALUES (not N serial inserts)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'application', 'user-command.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('private async insertRoleBindings');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async ensureEnvAdmin', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    expect(fn).toContain('values');
    expect(fn).toMatch(/VALUES\s+\$\{values\}/);
    expect(fn).toContain('UserRoleBinding');
  });

  it('create + updateRoles call insertRoleBindings (no N serial INSERT loops)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'user-access', 'application', 'user-command.service.ts'),
      'utf8'
    );

    // create() path
    const createStart = src.indexOf('async create(');
    expect(createStart).toBeGreaterThan(0);
    const createEnd = src.indexOf('\n  async update(', createStart + 10);
    const createFn = src.slice(createStart, createEnd > 0 ? createEnd : undefined);
    expect(createFn).toContain('insertRoleBindings');
    expect(createFn).not.toMatch(
      /for\s*\(\s*const\s+r\s+of\s+dto\.roles\s*\)[\s\S]{0,200}INSERT INTO "UserRoleBinding"/
    );

    // updateRoles() path
    const rolesStart = src.indexOf('async updateRoles(');
    expect(rolesStart).toBeGreaterThan(0);
    const rolesEnd = src.indexOf('\n  private async insertRoleBindings', rolesStart + 10);
    const rolesFn = src.slice(rolesStart, rolesEnd > 0 ? rolesEnd : undefined);
    expect(rolesFn).toContain('insertRoleBindings');
    expect(rolesFn).not.toMatch(
      /for\s*\(\s*const\s+r\s+of\s+dto\.roles\s*\)[\s\S]{0,200}INSERT INTO "UserRoleBinding"/
    );
  });
});
