import { describe, expect, it, vi } from 'vitest';
import { IamAccessService } from '../src/user-access/iam/iam-access.service';
import { expandIamPermissionCodes } from '../src/user-access/iam/iam.catalog';
import { IamOrganizationAdminService } from '../src/user-access/iam/iam-organization-admin.service';
import { IamRoleAdminService } from '../src/user-access/iam/iam-role-admin.service';
import { PermissionGuard } from '../src/user-access/iam/permission.guard';
import { PERMISSIONS_KEY } from '../src/user-access/iam/require-permissions.decorator';
import { PrismaService } from '../src/prisma/prisma.service';

describe('IAM permission aliases', () => {
  it('expands legacy codes into deterministic canonical permissions', () => {
    expect(
      expandIamPermissionCodes([
        'users:write',
        'iam:role:manage',
        'iam:access:assign',
        'content:read'
      ])
    ).toEqual([
      'iam:user:create',
      'iam:user:disable',
      'iam:roles:write',
      'iam:users:access',
      'content:read'
    ]);
  });

  it('projects legacy role rows into canonical access permissions', async () => {
    const prisma = {
      appUser: {
        findUnique: vi.fn().mockResolvedValue({
          tenantId: 'tenant_default',
          primaryOrgUnitId: 'org_hq',
          isActive: 1
        })
      },
      userOrganizationMembership: { findMany: vi.fn().mockResolvedValue([]) },
      userRoleAssignment: {
        findMany: vi.fn().mockResolvedValue([
          {
            assignmentId: 'assignment-1',
            roleId: 'role-legacy',
            scopeType: 'NONE',
            orgUnitId: null,
            role: {
              code: 'legacy_operator',
              permissions: [
                { permission: { code: 'users:write' } },
                { permission: { code: 'iam:role:manage' } }
              ]
            },
            orgUnit: null
          }
        ])
      }
    } as unknown as PrismaService;

    const accessService = new IamAccessService(prisma);
    await expect(accessService.getUserAccess('user-1', 'tenant_default')).resolves.toMatchObject({
      permissions: ['iam:roles:write', 'iam:user:create', 'iam:user:disable']
    });
    await expect(
      accessService.hasPermission('user-1', 'users:write', 'tenant_default')
    ).resolves.toBe(true);
    await expect(
      accessService.hasPermission('user-1', 'iam:user:update', 'tenant_default')
    ).resolves.toBe(false);
  });

  it('clears tenant IAM access cache after an organization-scope change', async () => {
    let permissionCode = 'content:read';
    const assignmentFindMany = vi.fn().mockImplementation(async () => [
      {
        assignmentId: 'assignment-cache',
        roleId: 'role-cache',
        scopeType: 'ORG_TREE',
        orgUnitId: 'org_hq',
        role: {
          code: 'operator',
          permissions: [{ permission: { code: permissionCode } }]
        },
        orgUnit: null
      }
    ]);
    const prisma = {
      appUser: {
        findUnique: vi.fn().mockResolvedValue({
          tenantId: 'tenant_default',
          primaryOrgUnitId: 'org_hq',
          isActive: 1
        })
      },
      userOrganizationMembership: { findMany: vi.fn().mockResolvedValue([]) },
      userRoleAssignment: { findMany: assignmentFindMany }
    } as unknown as PrismaService;
    const accessService = new IamAccessService(prisma);

    await expect(accessService.getUserAccess('user-1', 'tenant_default')).resolves.toMatchObject({
      permissions: ['content:read']
    });
    permissionCode = 'content:write';
    await expect(accessService.getUserAccess('user-1', 'tenant_default')).resolves.toMatchObject({
      permissions: ['content:read']
    });

    accessService.invalidateTenant('tenant_default');

    await expect(accessService.getUserAccess('user-1', 'tenant_default')).resolves.toMatchObject({
      permissions: ['content:write']
    });
    expect(assignmentFindMany).toHaveBeenCalledTimes(2);
  });

  it('keeps an area tree projection at the assigned organization boundary', async () => {
    const prisma = {
      appUser: {
        findUnique: vi.fn().mockResolvedValue({
          tenantId: 'tenant_default',
          primaryOrgUnitId: 'org_hq',
          isActive: 1
        })
      },
      userOrganizationMembership: { findMany: vi.fn().mockResolvedValue([]) },
      userRoleAssignment: {
        findMany: vi.fn().mockResolvedValue([
          {
            assignmentId: 'assignment-area-tree',
            roleId: 'role-area',
            scopeType: 'ORG_TREE',
            orgUnitId: 'org_region_A1',
            role: { code: 'area_operator', permissions: [] },
            orgUnit: {
              unitId: 'org_region_A1',
              code: 'A1',
              name: '区域 A1',
              unitType: 'REGION',
              areaId: 'A1',
              merchantId: null
            }
          }
        ])
      },
      organizationUnit: {
        findMany: vi.fn().mockResolvedValue([
          {
            unitId: 'org_region_A1',
            parentId: 'org_hq',
            code: 'A1',
            name: '区域 A1',
            unitType: 'REGION',
            areaId: 'A1',
            merchantId: null,
            isActive: 1
          },
          {
            unitId: 'org_merchant_M1',
            parentId: 'org_region_A1',
            code: 'M1',
            name: '商家 M1',
            unitType: 'MERCHANT',
            areaId: 'A1',
            merchantId: 'M1',
            isActive: 1
          }
        ])
      }
    } as unknown as PrismaService;

    const accessService = new IamAccessService(prisma);

    await expect(accessService.getLegacyBindings('user-1', 'tenant_default')).resolves.toEqual([
      { role: 'area_operator', scopeType: 'area', scopeId: 'A1' }
    ]);
  });

  it('keeps ALL and NONE assignments aligned with unscoped legacy rows', async () => {
    const prisma = {
      appUser: {
        findUnique: vi.fn().mockResolvedValue({
          tenantId: 'tenant_default',
          primaryOrgUnitId: 'org_hq',
          isActive: 1
        })
      },
      userOrganizationMembership: { findMany: vi.fn().mockResolvedValue([]) },
      userRoleAssignment: {
        findMany: vi.fn().mockResolvedValue([
          {
            assignmentId: 'assignment-all',
            roleId: 'role-platform',
            scopeType: 'ALL',
            orgUnitId: null,
            role: { code: 'platform_operator', permissions: [] },
            orgUnit: null
          },
          {
            assignmentId: 'assignment-none',
            roleId: 'role-executor',
            scopeType: 'NONE',
            orgUnitId: null,
            role: { code: 'executor', permissions: [] },
            orgUnit: null
          }
        ])
      }
    } as unknown as PrismaService;

    const accessService = new IamAccessService(prisma);

    await expect(accessService.getLegacyBindings('user-1', 'tenant_default')).resolves.toEqual([
      { role: 'platform_operator' },
      { role: 'executor' }
    ]);
  });

  it('enforces aliases through the same all-required permission rule', async () => {
    const handler = () => undefined;
    const reflector = {
      getAllAndOverride: vi.fn((key: string) =>
        key === PERMISSIONS_KEY ? ['users:write'] : undefined
      )
    };
    const accessService = {
      getUserAccess: vi.fn().mockResolvedValue({
        tenantId: 'tenant_default',
        permissions: ['iam:user:create', 'iam:user:disable']
      })
    };
    const shadowService = { inspect: vi.fn().mockResolvedValue(undefined) };
    const guard = new PermissionGuard(
      reflector as never,
      accessService as never,
      shadowService as never
    );
    const context = {
      getHandler: () => handler,
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => ({ user: { userId: 'user-1', tenantId: 'tenant_default' } })
      })
    };

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(shadowService.inspect).toHaveBeenCalled();

    accessService.getUserAccess.mockResolvedValue({
      tenantId: 'tenant_default',
      permissions: ['iam:user:create']
    });
    await expect(guard.canActivate(context as never)).rejects.toThrow('缺少所需权限');
  });

  it('rejects a permission request without a tenant boundary before IAM lookup', async () => {
    const accessService = { getUserAccess: vi.fn() };
    const shadowService = { inspect: vi.fn() };
    const guard = new PermissionGuard(
      {
        getAllAndOverride: vi.fn((key: string) =>
          key === PERMISSIONS_KEY ? ['content:read'] : undefined
        )
      } as never,
      accessService as never,
      shadowService as never
    );
    const context = {
      getHandler: () => () => undefined,
      getClass: () => class TestController {},
      switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'user-1' } }) })
    };

    await expect(guard.canActivate(context as never)).rejects.toThrow('会话缺少租户信息');
    expect(accessService.getUserAccess).not.toHaveBeenCalled();
    expect(shadowService.inspect).not.toHaveBeenCalled();
  });

  it('keeps authorization active when shadow telemetry throws', async () => {
    const reflector = {
      getAllAndOverride: vi.fn((key: string) =>
        key === PERMISSIONS_KEY ? ['content:read'] : undefined
      )
    };
    const accessService = {
      getUserAccess: vi.fn().mockResolvedValue({
        tenantId: 'tenant_default',
        permissions: ['content:read']
      })
    };
    const shadowService = {
      inspect: vi.fn().mockRejectedValue(new Error('shadow unavailable'))
    };
    const guard = new PermissionGuard(
      reflector as never,
      accessService as never,
      shadowService as never
    );
    const context = {
      getHandler: () => () => undefined,
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => ({ user: { userId: 'user-1', tenantId: 'tenant_default' } })
      })
    };

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(shadowService.inspect).toHaveBeenCalledTimes(1);
  });

  it('stores canonical permission rows when a role is created with a legacy code', async () => {
    const permissionFindMany = vi.fn().mockResolvedValue([
      { permissionId: 'perm-create', code: 'iam:user:create' },
      { permissionId: 'perm-disable', code: 'iam:user:disable' }
    ]);
    const rolePermissionCreate = vi.fn().mockResolvedValue({});
    const tx = {
      role: {
        create: vi.fn().mockResolvedValue({ roleId: 'role-alias' })
      },
      rolePermission: {
        deleteMany: vi.fn().mockResolvedValue({}),
        create: rolePermissionCreate
      }
    };
    const prisma = {
      permission: { findMany: permissionFindMany },
      role: {
        findFirst: vi.fn().mockResolvedValue({
          roleId: 'role-alias',
          code: 'legacy-user-writer',
          name: '旧用户写入角色',
          description: null,
          isSystemTemplate: 0,
          isActive: 1,
          permissions: [
            { permissionId: 'perm-create', permission: { code: 'iam:user:create' } },
            { permissionId: 'perm-disable', permission: { code: 'iam:user:disable' } }
          ]
        })
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
    } as unknown as PrismaService;

    const service = new IamRoleAdminService(prisma, {} as IamAccessService);
    await service.createRole('tenant_default', {
      code: 'legacy-user-writer',
      name: '旧用户写入角色',
      permissionCodes: ['users:write']
    });

    expect(permissionFindMany).toHaveBeenCalledWith({
      where: {
        code: { in: ['iam:user:create', 'iam:user:disable'] },
        deletedAt: null
      },
      select: { permissionId: true, code: true }
    });
    expect(rolePermissionCreate.mock.calls.map(([call]) => call.data.permissionId)).toEqual([
      'perm-create',
      'perm-disable'
    ]);
  });

  it('invalidates IAM and JWT tenant caches after creating an organization unit', async () => {
    const invalidateTenant = vi.fn();
    const invalidateJwtTenant = vi.fn();
    const prisma = {
      organizationUnit: {
        create: vi.fn().mockResolvedValue({ unitId: 'org-created', tenantId: 'tenant_default' })
      }
    } as unknown as PrismaService;
    const service = new IamOrganizationAdminService(
      prisma,
      { invalidateTenant } as unknown as IamAccessService,
      { invalidateTenant: invalidateJwtTenant } as never
    );

    await service.createOrganizationUnit(
      'tenant_default',
      {
        code: 'created_hq',
        name: '新增总部',
        unitType: 'HEADQUARTERS'
      } as never,
      'admin'
    );

    expect(invalidateTenant).toHaveBeenCalledWith('tenant_default');
    expect(invalidateJwtTenant).toHaveBeenCalledWith('tenant_default');
  });
});
