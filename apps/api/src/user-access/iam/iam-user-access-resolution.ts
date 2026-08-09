import { BadRequestException } from '@nestjs/common';
import { RoleScopeType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ReplaceUserAccessDto } from './iam.dto';
import { ResolvedIamAssignment } from './iam-admin.types';

const ROLE_SCOPE_SET = new Set<RoleScopeType>([
  RoleScopeType.ALL,
  RoleScopeType.ORG_TREE,
  RoleScopeType.ORG_ONLY,
  RoleScopeType.NONE
]);

export async function resolveIamAssignments(
  prisma: PrismaService,
  tenantId: string,
  dto: ReplaceUserAccessDto
): Promise<ResolvedIamAssignment[]> {
  const roleCodes = [...new Set(dto.assignments.map((assignment) => assignment.roleCode.trim()))];
  const roles = await prisma.role.findMany({
    where: { tenantId, code: { in: roleCodes }, isActive: 1, deletedAt: null },
    select: {
      roleId: true,
      code: true,
      permissions: {
        where: { granted: 1, deletedAt: null, permission: { deletedAt: null } },
        select: { permission: { select: { code: true } } }
      }
    }
  });
  const roleByCode = new Map(roles.map((role) => [role.code, role]));
  const missingRoles = roleCodes.filter((code) => !roleByCode.has(code));
  if (missingRoles.length) {
    throw new BadRequestException(`角色不存在或已停用: ${missingRoles.join(', ')}`);
  }

  const resolved: ResolvedIamAssignment[] = [];
  for (const assignment of dto.assignments) {
    const scopeType = assignment.scopeType as RoleScopeType;
    if (!ROLE_SCOPE_SET.has(scopeType)) throw new BadRequestException('无效的权限范围类型');
    const orgUnitId = assignment.orgUnitId?.trim() || null;
    if ((scopeType === RoleScopeType.ALL || scopeType === RoleScopeType.NONE) && orgUnitId) {
      throw new BadRequestException('ALL/NONE 范围不能绑定组织单元');
    }
    if (
      (scopeType === RoleScopeType.ORG_ONLY || scopeType === RoleScopeType.ORG_TREE) &&
      !orgUnitId
    ) {
      throw new BadRequestException('组织范围必须绑定组织单元');
    }
    const role = roleByCode.get(assignment.roleCode.trim())!;
    resolved.push({
      roleId: role.roleId,
      roleCode: role.code,
      scopeType,
      orgUnitId,
      legacyOrgUnit: null,
      permissionCodes: role.permissions.map((item) => item.permission.code)
    });
  }

  const scopedIds = resolved.flatMap((assignment) =>
    assignment.orgUnitId ? [assignment.orgUnitId] : []
  );
  if (scopedIds.length) {
    const units = await prisma.organizationUnit.findMany({
      where: {
        tenantId,
        unitId: { in: [...new Set(scopedIds)] },
        isActive: 1,
        deletedAt: null
      },
      select: { unitId: true, areaId: true, merchantId: true }
    });
    const found = new Map(units.map((unit) => [unit.unitId, unit]));
    if (scopedIds.some((id) => !found.has(id))) {
      throw new BadRequestException('权限范围组织不存在或已停用');
    }
    for (const assignment of resolved) {
      assignment.legacyOrgUnit = assignment.orgUnitId
        ? (found.get(assignment.orgUnitId) ?? null)
        : null;
    }
  }
  for (const assignment of resolved) assignment.legacyOrgUnit ??= null;
  return resolved;
}

export async function resolveIamMembershipIds(
  prisma: PrismaService,
  tenantId: string,
  userId: string,
  dto: ReplaceUserAccessDto,
  assignments: Array<{ orgUnitId: string | null }>
): Promise<string[]> {
  const existingIds =
    dto.organizationUnitIds === undefined
      ? await prisma.userOrganizationMembership.findMany({
          where: { tenantId, userId, isActive: 1, deletedAt: null },
          select: { orgUnitId: true }
        })
      : [];
  const ids = [
    ...(dto.organizationUnitIds ?? existingIds.map((row) => row.orgUnitId)),
    ...assignments.flatMap((assignment) => (assignment.orgUnitId ? [assignment.orgUnitId] : []))
  ];
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (dto.primaryOrgUnitId && !uniqueIds.includes(dto.primaryOrgUnitId.trim())) {
    throw new BadRequestException('主组织必须属于用户组织成员关系');
  }
  if (!uniqueIds.length) return [];
  const units = await prisma.organizationUnit.findMany({
    where: { tenantId, unitId: { in: uniqueIds }, isActive: 1, deletedAt: null },
    select: { unitId: true }
  });
  if (units.length !== uniqueIds.length) {
    throw new BadRequestException('组织成员关系包含无效组织');
  }
  return uniqueIds;
}

export async function hasActiveIamRole(
  prisma: PrismaService,
  userId: string,
  tenantId: string,
  code: string
): Promise<boolean> {
  const rows = await prisma.userRoleAssignment.findMany({
    where: { tenantId, userId, isActive: 1, deletedAt: null, role: { code, deletedAt: null } },
    select: { assignmentId: true }
  });
  return rows.length > 0;
}

export async function assertAnotherActiveIamAdmin(
  prisma: PrismaService,
  tenantId: string,
  userId: string
): Promise<void> {
  const assignments = await prisma.userRoleAssignment.findMany({
    where: {
      tenantId,
      isActive: 1,
      deletedAt: null,
      userId: { not: userId },
      role: { code: 'admin', deletedAt: null }
    },
    distinct: ['userId'],
    select: { userId: true }
  });
  if (!assignments.length) throw new BadRequestException('不能移除最后一个有效 admin 角色');
  const activeUsers = await prisma.appUser.count({
    where: { tenantId, isActive: 1, userId: { in: assignments.map((row) => row.userId) } }
  });
  if (activeUsers === 0) throw new BadRequestException('不能移除最后一个有效 admin 角色');
}
