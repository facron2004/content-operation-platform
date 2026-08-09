import { ForbiddenException } from '@nestjs/common';
import { RoleScopeType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { expandIamPermissionCodes } from './iam.catalog';
import { IamAccessService } from './iam-access.service';
import { ResolvedIamAssignment } from './iam-admin.types';

export async function assertCanGrantIamAssignments(
  prisma: PrismaService,
  accessService: IamAccessService,
  tenantId: string,
  actorId: string | undefined,
  assignments: ResolvedIamAssignment[]
): Promise<void> {
  if (!actorId) return;
  const access = await accessService.getUserAccess(actorId, tenantId);
  if (!access) throw new ForbiddenException('当前操作者无有效 IAM 授权');
  if (access.roles.includes('admin')) return;
  const normalizedPermissions = assignments.flatMap((assignment) =>
    expandIamPermissionCodes(assignment.permissionCodes)
  );
  if (normalizedPermissions.includes('iam:root')) {
    throw new ForbiddenException('iam:root 仅系统 admin 可授予');
  }
  const owned = new Set(access.permissions);
  if (normalizedPermissions.some((code) => !owned.has(code))) {
    throw new ForbiddenException('不能授予当前操作者未拥有的角色权限');
  }
  const canManageAll = access.roleAssignments.some(
    (assignment) => assignment.scopeType === RoleScopeType.ALL
  );
  if (canManageAll) return;

  const memberships = new Set(access.memberships.map((membership) => membership.orgUnitId));
  const actorOrgAssignments = access.roleAssignments.filter(
    (assignment) =>
      assignment.scopeType === RoleScopeType.ORG_TREE ||
      assignment.scopeType === RoleScopeType.ORG_ONLY
  );
  const organizationUnits = await prisma.organizationUnit.findMany({
    where: { tenantId, isActive: 1, deletedAt: null },
    select: { unitId: true, parentId: true }
  });
  const parentById = new Map(organizationUnits.map((unit) => [unit.unitId, unit.parentId]));
  const isInActorTree = (rootId: string, candidateId: string): boolean => {
    const visited = new Set<string>();
    let cursor: string | null = candidateId;
    while (cursor && !visited.has(cursor)) {
      if (cursor === rootId) return true;
      visited.add(cursor);
      cursor = parentById.get(cursor) ?? null;
    }
    return false;
  };
  const canManageOrganization = (scopeType: RoleScopeType, orgUnitId: string | null) => {
    if (!orgUnitId) return false;
    if (scopeType === RoleScopeType.ORG_TREE) {
      return actorOrgAssignments.some(
        (assignment) =>
          assignment.scopeType === RoleScopeType.ORG_TREE &&
          Boolean(assignment.orgUnitId) &&
          isInActorTree(assignment.orgUnitId!, orgUnitId)
      );
    }
    if (scopeType === RoleScopeType.ORG_ONLY) {
      return (
        memberships.has(orgUnitId) ||
        actorOrgAssignments.some(
          (assignment) =>
            Boolean(assignment.orgUnitId) &&
            (assignment.scopeType === RoleScopeType.ORG_ONLY ||
              assignment.scopeType === RoleScopeType.ORG_TREE) &&
            isInActorTree(assignment.orgUnitId!, orgUnitId)
        )
      );
    }
    return false;
  };

  for (const assignment of assignments) {
    if (assignment.scopeType === RoleScopeType.ALL) {
      throw new ForbiddenException('ALL 范围仅管理员或全租户授权者可授予');
    }
    if (
      (assignment.scopeType === RoleScopeType.ORG_TREE ||
        assignment.scopeType === RoleScopeType.ORG_ONLY) &&
      !canManageOrganization(assignment.scopeType, assignment.orgUnitId)
    ) {
      throw new ForbiddenException('不能授予当前操作者组织范围之外的授权');
    }
  }
}
