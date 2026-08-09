import { describe, expect, it } from 'vitest';
import { buildNavTree } from './composables/shell-layout-nav';
import { resolvePermissionAccess } from './router-nav-reliability';

function leafPaths(tree: ReturnType<typeof buildNavTree>): string[] {
  return tree.flatMap((node) =>
    node.kind === 'item' ? [node.path] : node.children.map((child) => child.path)
  );
}

describe('permission-driven navigation', () => {
  it('removes routes that are outside a scoped operator permission set', () => {
    const paths = leafPaths(buildNavTree(['tasks:read', 'packages:read', 'content:write']));

    expect(paths).toEqual(
      expect.arrayContaining(['/dashboard', '/movement', '/zero-sales', '/tasks'])
    );
    expect(paths).not.toEqual(expect.arrayContaining(['/gmv-cockpit', '/users', '/audit-logs']));
  });

  it('does not treat an unknown session as permission denial', () => {
    expect(
      resolvePermissionAccess({
        requiredPermissions: ['analytics:read'],
        hasServerSession: false,
        permissions: []
      })
    ).toBe('session-unknown');
    expect(
      resolvePermissionAccess({
        requiredPermissions: ['analytics:read'],
        hasServerSession: true,
        permissions: ['tasks:read']
      })
    ).toBe('deny');
  });

  it('exposes attribution only to sessions with attribution read permission', () => {
    expect(leafPaths(buildNavTree(['attribution:read']))).toContain('/attribution');
    expect(leafPaths(buildNavTree(['tasks:read']))).not.toContain('/attribution');
  });
});
