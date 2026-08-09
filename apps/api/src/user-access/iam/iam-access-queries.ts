import { PrismaService } from '../../prisma/prisma.service';
import { expandIamPermissionCodes } from './iam.catalog';
import type { IamLegacyScopeBinding, IamUserAccess } from './iam-access-types';

export async function loadIamUserAccess(
  prisma: PrismaService,
  userId: string,
  tenantId: string,
  includeInactive = false
): Promise<IamUserAccess | null> {
  const user = await prisma.appUser.findUnique({
    where: { userId },
    select: { tenantId: true, primaryOrgUnitId: true, isActive: true }
  });
  if (!user || (!includeInactive && Number(user.isActive) !== 1) || user.tenantId !== tenantId) {
    return null;
  }

  const [memberships, assignments] = await Promise.all([
    prisma.userOrganizationMembership.findMany({
      where: {
        tenantId: user.tenantId,
        userId,
        isActive: 1,
        deletedAt: null,
        orgUnit: { isActive: 1, deletedAt: null }
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: {
        membershipId: true,
        orgUnitId: true,
        isPrimary: true,
        orgUnit: {
          select: {
            unitId: true,
            code: true,
            name: true,
            unitType: true,
            areaId: true,
            merchantId: true
          }
        }
      }
    }),
    prisma.userRoleAssignment.findMany({
      where: {
        tenantId: user.tenantId,
        userId,
        isActive: 1,
        deletedAt: null,
        role: { isActive: 1, deletedAt: null }
      },
      orderBy: { createdAt: 'asc' },
      select: {
        assignmentId: true,
        roleId: true,
        scopeType: true,
        orgUnitId: true,
        role: {
          select: {
            code: true,
            permissions: {
              where: { granted: 1, deletedAt: null, permission: { deletedAt: null } },
              select: { permission: { select: { code: true } } }
            }
          }
        },
        orgUnit: {
          select: {
            unitId: true,
            code: true,
            name: true,
            unitType: true,
            areaId: true,
            merchantId: true
          }
        }
      }
    })
  ]);

  const permissionSet = new Set<string>();
  for (const assignment of assignments) {
    for (const row of assignment.role.permissions) {
      for (const permission of expandIamPermissionCodes([row.permission.code])) {
        permissionSet.add(permission);
      }
    }
  }

  return {
    tenantId: user.tenantId,
    primaryOrgUnitId: user.primaryOrgUnitId,
    permissions: [...permissionSet].sort(),
    memberships: memberships.map((membership) => ({
      membershipId: membership.membershipId,
      orgUnitId: membership.orgUnitId,
      isPrimary: Number(membership.isPrimary) === 1,
      orgUnit: membership.orgUnit
    })),
    roleAssignments: assignments.map((assignment) => ({
      assignmentId: assignment.assignmentId,
      roleId: assignment.roleId,
      role: assignment.role.code,
      scopeType: assignment.scopeType,
      orgUnitId: assignment.orgUnitId,
      orgUnit: assignment.orgUnit
    })),
    roles: [...new Set(assignments.map((assignment) => assignment.role.code))]
  };
}

export async function loadPersistedIamLegacyBindings(
  prisma: PrismaService,
  userId: string,
  tenantId: string
): Promise<IamLegacyScopeBinding[] | null> {
  const user = await prisma.appUser.findUnique({
    where: { userId },
    select: { tenantId: true }
  });
  if (!user || user.tenantId !== tenantId) return null;

  const rows = await prisma.userRoleBinding.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { role: true, scopeType: true, scopeId: true }
  });
  return rows.map((row) => {
    const scopeType =
      row.scopeType === 'all' || row.scopeType === 'area' || row.scopeType === 'merchant'
        ? row.scopeType
        : undefined;
    return {
      role: row.role,
      ...(scopeType ? { scopeType } : {}),
      ...(scopeType && row.scopeId ? { scopeId: row.scopeId } : {})
    };
  });
}

export function listIamPermissions(prisma: PrismaService) {
  return prisma.permission.findMany({
    where: { deletedAt: null },
    orderBy: { code: 'asc' },
    select: { permissionId: true, code: true, name: true, description: true, isSystem: true }
  });
}

export function listIamRoles(prisma: PrismaService, tenantId: string) {
  return prisma.role.findMany({
    where: { tenantId, isActive: 1, deletedAt: null },
    orderBy: { code: 'asc' },
    select: {
      roleId: true,
      code: true,
      name: true,
      description: true,
      isSystemTemplate: true,
      isActive: true,
      permissions: {
        where: { granted: 1, deletedAt: null, permission: { deletedAt: null } },
        orderBy: { permissionId: 'asc' },
        select: { permissionId: true, permission: { select: { code: true } } }
      }
    }
  });
}

export function listIamOrganizationUnits(prisma: PrismaService, tenantId: string) {
  return prisma.organizationUnit.findMany({
    where: { tenantId, isActive: 1, deletedAt: null },
    orderBy: [{ unitType: 'asc' }, { name: 'asc' }],
    select: {
      unitId: true,
      parentId: true,
      code: true,
      name: true,
      unitType: true,
      areaId: true,
      merchantId: true,
      isActive: true
    }
  });
}
