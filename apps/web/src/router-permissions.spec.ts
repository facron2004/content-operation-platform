import { describe, expect, it } from 'vitest';
import { buildNavTree } from './composables/shell-layout-nav';
import { permissionsForRoute } from './route-permissions';
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
      expect.arrayContaining(['/products', '/movement', '/zero-sales', '/tasks'])
    );
    expect(paths).not.toEqual(
      expect.arrayContaining(['/dashboard', '/gmv-cockpit', '/users', '/audit-logs'])
    );
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

  it('keeps the legacy attribution URL out of the primary navigation', () => {
    expect(leafPaths(buildNavTree(['attribution:read']))).not.toContain('/attribution');
    expect(leafPaths(buildNavTree(['campaigns:read']))).toContain('/marketing/campaigns');
  });

  it('exposes one combined region/category analysis entry', () => {
    const paths = leafPaths(buildNavTree(['analytics:read']));

    expect(paths).toContain('/operation/analysis');
    expect(paths).not.toEqual(expect.arrayContaining(['/operation/region', '/operation/category']));
    expect(paths).toContain('/operation/alerts');
    expect(permissionsForRoute('operation-alerts')).toEqual(['analytics:read']);
    expect(leafPaths(buildNavTree(['content:read']))).not.toContain('/operation/alerts');
  });

  it('uses the order read contract for delivery and card pages', () => {
    expect(permissionsForRoute('deliveries')).toEqual(['orders:read']);
    expect(permissionsForRoute('card-batches')).toEqual(['orders:read']);
    expect(permissionsForRoute('cards')).toEqual(['orders:read']);

    const analyticsPaths = leafPaths(buildNavTree(['analytics:read']));
    expect(analyticsPaths).not.toEqual(
      expect.arrayContaining(['/deliveries', '/cards/batches', '/cards'])
    );
  });
});
