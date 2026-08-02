import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from '@nestjs/common';
import { OrganizationUnitType, RoleScopeType } from '@prisma/client';
import {
  CloneIamRoleDto,
  CreateOrganizationUnitDto,
  CreateIamRoleDto,
  ReplaceUserAccessDto,
  UpdateIamRoleDto,
  UpdateOrganizationUnitDto
} from './iam.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { newEntityId } from '../../common/id';
import { IamAccessService } from './iam-access.service';
import { syncLegacyProjection } from './iam-projection';
import { JwtStrategy } from '../../auth/jwt.strategy';

const ROLE_SCOPE_SET = new Set<RoleScopeType>([
  RoleScopeType.ALL,
  RoleScopeType.ORG_TREE,
  RoleScopeType.ORG_ONLY,
  RoleScopeType.NONE
]);

@Injectable()
export class IamAdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IamAccessService) private readonly accessService: IamAccessService,
    @Optional() @Inject(JwtStrategy) private readonly jwtStrategy?: JwtStrategy
  ) {}

  async createRole(tenantId: string, dto: CreateIamRoleDto, actorId?: string) {
    const code = this.normalizeCode(dto.code);
    await this.assertCanGrantPermissionCodes(tenantId, actorId, dto.permissionCodes);
    const permissionIds = await this.resolvePermissionIds(dto.permissionCodes);
    try {
      const role = await this.prisma.$transaction(async (tx) => {
        const created = await tx.role.create({
          data: {
            roleId: newEntityId('role'),
            tenantId,
            code,
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            createdBy: actorId ?? null,
            updatedBy: actorId ?? null
          }
        });
        await this.replaceRolePermissions(tx, created.roleId, permissionIds, actorId);
        return created;
      });
      return this.getRole(tenantId, role.roleId);
    } catch (error) {
      this.rethrowUnique(error, `角色 ${code} 已存在`);
    }
  }

  async cloneRole(tenantId: string, roleId: string, dto: CloneIamRoleDto, actorId?: string) {
    const source = await this.prisma.role.findFirst({
      where: { roleId, tenantId, isActive: 1, deletedAt: null },
      select: {
        name: true,
        description: true,
        permissions: {
          where: { granted: 1, deletedAt: null, permission: { deletedAt: null } },
          select: { permission: { select: { code: true } } }
        }
      }
    });
    if (!source) throw new NotFoundException('源角色不存在或已停用');
    return this.createRole(
      tenantId,
      {
        code: dto.code,
        name: dto.name?.trim() || `${source.name}副本`,
        description: dto.description?.trim() || source.description || undefined,
        permissionCodes: source.permissions.map((item) => item.permission.code)
      },
      actorId
    );
  }

  async updateRole(tenantId: string, roleId: string, dto: UpdateIamRoleDto, actorId?: string) {
    const role = await this.prisma.role.findFirst({
      where: { roleId, tenantId, deletedAt: null }
    });
    if (!role) throw new NotFoundException('角色不存在');
    if (Number(role.isSystemTemplate) === 1) {
      throw new ConflictException('系统角色模板只读，请复制后编辑');
    }
    const permissionIds =
      dto.permissionCodes === undefined
        ? undefined
        : await this.resolvePermissionIds(dto.permissionCodes);
    if (dto.permissionCodes !== undefined) {
      await this.assertCanGrantPermissionCodes(tenantId, actorId, dto.permissionCodes);
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.role.update({
          where: { roleId },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.description !== undefined
              ? { description: dto.description.trim() || null }
              : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive ? 1 : 0 } : {}),
            updatedBy: actorId ?? null
          }
        });
        if (permissionIds !== undefined) {
          await this.replaceRolePermissions(tx, roleId, permissionIds, actorId);
        }
      });
    } catch (error) {
      this.rethrowUnique(error, '角色更新冲突');
    }
    const assignmentUsers = await this.prisma.userRoleAssignment.findMany({
      where: { roleId, tenantId, deletedAt: null },
      distinct: ['userId'],
      select: { userId: true }
    });
    for (const row of assignmentUsers) {
      await this.prisma.appUser.update({
        where: { userId: row.userId },
        data: { tokenVersion: { increment: 1 } }
      });
      this.accessService.invalidateUser(row.userId, tenantId);
      this.jwtStrategy?.invalidateStatus(row.userId);
    }
    return this.getRole(tenantId, roleId);
  }

  async createOrganizationUnit(tenantId: string, dto: CreateOrganizationUnitDto, actorId?: string) {
    const input = await this.validateOrganizationInput(tenantId, dto);
    try {
      return await this.prisma.organizationUnit.create({
        data: {
          unitId: newEntityId('org'),
          tenantId,
          code: input.code,
          name: input.name,
          unitType: input.unitType,
          parentId: input.parentId,
          areaId: input.areaId,
          merchantId: input.merchantId,
          createdBy: actorId ?? null,
          updatedBy: actorId ?? null
        }
      });
    } catch (error) {
      this.rethrowUnique(error, `组织编码 ${input.code} 已存在`);
    }
  }

  async updateOrganizationUnit(
    tenantId: string,
    unitId: string,
    dto: UpdateOrganizationUnitDto,
    actorId?: string
  ) {
    const current = await this.prisma.organizationUnit.findFirst({
      where: { unitId, tenantId, deletedAt: null }
    });
    if (!current) throw new NotFoundException('组织单元不存在');
    if (dto.isActive === false) {
      const activeChildren = await this.prisma.organizationUnit.count({
        where: { tenantId, parentId: unitId, isActive: 1, deletedAt: null }
      });
      if (activeChildren > 0) throw new BadRequestException('请先停用子组织单元');
    }
    const parentId = dto.parentId === undefined ? current.parentId : dto.parentId || null;
    if (parentId === unitId) throw new BadRequestException('组织单元不能以自身为父节点');
    if (parentId) await this.assertParent(tenantId, parentId, current.unitType);
    try {
      const updated = await this.prisma.organizationUnit.update({
        where: { unitId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          parentId,
          ...(dto.areaId !== undefined ? { areaId: dto.areaId.trim() || null } : {}),
          ...(dto.merchantId !== undefined ? { merchantId: dto.merchantId.trim() || null } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive ? 1 : 0 } : {}),
          updatedBy: actorId ?? null
        }
      });
      const affectedUsers = await this.prisma.userOrganizationMembership.findMany({
        where: { tenantId, orgUnitId: unitId },
        distinct: ['userId'],
        select: { userId: true }
      });
      for (const row of affectedUsers) {
        await this.prisma.appUser.update({
          where: { userId: row.userId },
          data: { tokenVersion: { increment: 1 } }
        });
        this.accessService.invalidateUser(row.userId, tenantId);
        this.jwtStrategy?.invalidateStatus(row.userId);
      }
      return updated;
    } catch (error) {
      this.rethrowUnique(error, '组织单元更新冲突');
    }
  }

  async replaceUserAccess(
    tenantId: string,
    userId: string,
    dto: ReplaceUserAccessDto,
    actorId?: string
  ) {
    const user = await this.prisma.appUser.findFirst({
      where: { userId, tenantId },
      select: { userId: true, isActive: true, primaryOrgUnitId: true }
    });
    if (!user) throw new NotFoundException('用户不存在');

    const assignments = await this.resolveAssignments(tenantId, dto);
    await this.assertCanGrantAssignments(tenantId, actorId, assignments);
    const organizationUnitIds = await this.resolveMembershipIds(tenantId, userId, dto, assignments);
    const currentAdmin = await this.hasActiveRole(userId, tenantId, 'admin');
    const nextAdmin = assignments.some((assignment) => assignment.roleCode === 'admin');
    if (Number(user.isActive) === 1 && currentAdmin && !nextAdmin) {
      await this.assertAnotherActiveAdmin(tenantId, userId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userRoleAssignment.deleteMany({ where: { tenantId, userId } });
      for (const assignment of assignments) {
        await tx.userRoleAssignment.create({
          data: {
            assignmentId: newEntityId('ura'),
            tenantId,
            userId,
            roleId: assignment.roleId,
            scopeType: assignment.scopeType,
            orgUnitId: assignment.orgUnitId,
            createdBy: actorId ?? null,
            updatedBy: actorId ?? null
          }
        });
      }
      if (dto.organizationUnitIds !== undefined) {
        await tx.userOrganizationMembership.deleteMany({ where: { tenantId, userId } });
      }
      const primaryOrgUnitId =
        dto.primaryOrgUnitId ??
        (user.primaryOrgUnitId && organizationUnitIds.includes(user.primaryOrgUnitId)
          ? user.primaryOrgUnitId
          : (organizationUnitIds[0] ?? null));
      await tx.userOrganizationMembership.updateMany({
        where: { tenantId, userId },
        data: { isPrimary: 0, updatedBy: actorId ?? null }
      });
      for (const orgUnitId of organizationUnitIds) {
        await tx.userOrganizationMembership.upsert({
          where: { tenantId_userId_orgUnitId: { tenantId, userId, orgUnitId } },
          create: {
            membershipId: newEntityId('uom'),
            tenantId,
            userId,
            orgUnitId,
            isPrimary: orgUnitId === primaryOrgUnitId ? 1 : 0,
            createdBy: actorId ?? null,
            updatedBy: actorId ?? null
          },
          update: {
            isPrimary: orgUnitId === primaryOrgUnitId ? 1 : 0,
            isActive: 1,
            updatedBy: actorId ?? null
          }
        });
      }
      await tx.appUser.update({
        where: { userId },
        data: {
          primaryOrgUnitId,
          // Authorization changes must invalidate already-issued JWTs.
          tokenVersion: { increment: 1 }
        }
      });
      await syncLegacyProjection(
        tx,
        userId,
        assignments.map((assignment) => ({
          roleCode: assignment.roleCode,
          scopeType: assignment.scopeType,
          orgUnit: assignment.legacyOrgUnit
        }))
      );
    });
    this.accessService.invalidateUser(userId, tenantId);
    this.jwtStrategy?.invalidateStatus(userId);
    return this.accessService.getUserAccess(userId, tenantId);
  }

  private async getRole(tenantId: string, roleId: string) {
    return this.prisma.role.findFirst({
      where: { roleId, tenantId },
      select: {
        roleId: true,
        code: true,
        name: true,
        description: true,
        isSystemTemplate: true,
        isActive: true,
        permissions: {
          where: { granted: 1, deletedAt: null, permission: { deletedAt: null } },
          select: { permissionId: true, permission: { select: { code: true } } }
        }
      }
    });
  }

  private async resolvePermissionIds(codes: string[]): Promise<string[]> {
    const normalized = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
    const rows = normalized.length
      ? await this.prisma.permission.findMany({
          where: { code: { in: normalized }, deletedAt: null },
          select: { permissionId: true, code: true }
        })
      : [];
    const found = new Set(rows.map((row) => row.code));
    const missing = normalized.filter((code) => !found.has(code));
    if (missing.length) throw new BadRequestException(`权限不存在: ${missing.join(', ')}`);
    return rows.map((row) => row.permissionId);
  }

  private async assertCanGrantPermissionCodes(
    tenantId: string,
    actorId: string | undefined,
    permissionCodes: string[]
  ): Promise<void> {
    if (!actorId) return;
    const access = await this.accessService.getUserAccess(actorId, tenantId);
    if (!access) throw new ForbiddenException('当前操作者无有效 IAM 授权');
    if (access.roles.includes('admin')) return;
    if (permissionCodes.some((code) => code.trim() === 'iam:root')) {
      throw new ForbiddenException('iam:root 仅系统 admin 可授予');
    }
    const owned = new Set(access.permissions);
    if (permissionCodes.some((code) => !owned.has(code.trim()))) {
      throw new ForbiddenException('不能授予当前操作者未拥有的权限');
    }
  }

  private async assertCanGrantAssignments(
    tenantId: string,
    actorId: string | undefined,
    assignments: Array<{
      permissionCodes: string[];
      orgUnitId: string | null;
    }>
  ): Promise<void> {
    if (!actorId) return;
    const access = await this.accessService.getUserAccess(actorId, tenantId);
    if (!access) throw new ForbiddenException('当前操作者无有效 IAM 授权');
    if (access.roles.includes('admin')) return;
    if (assignments.some((assignment) => assignment.permissionCodes.includes('iam:root'))) {
      throw new ForbiddenException('iam:root 仅系统 admin 可授予');
    }
    const owned = new Set(access.permissions);
    if (
      assignments.some((assignment) => assignment.permissionCodes.some((code) => !owned.has(code)))
    ) {
      throw new ForbiddenException('不能授予当前操作者未拥有的角色权限');
    }
    const canManageAll = access.roleAssignments.some(
      (assignment) => assignment.scopeType === 'ALL'
    );
    const memberships = new Set(access.memberships.map((membership) => membership.orgUnitId));
    if (
      !canManageAll &&
      assignments.some(
        (assignment) => assignment.orgUnitId && !memberships.has(assignment.orgUnitId)
      )
    ) {
      throw new ForbiddenException('不能授予当前操作者组织范围之外的授权');
    }
  }

  private async replaceRolePermissions(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    roleId: string,
    permissionIds: string[],
    actorId?: string
  ) {
    await tx.rolePermission.deleteMany({ where: { roleId } });
    for (const permissionId of permissionIds) {
      await tx.rolePermission.create({
        data: {
          roleId,
          permissionId,
          granted: 1,
          createdBy: actorId ?? null,
          updatedBy: actorId ?? null
        }
      });
    }
  }

  private async validateOrganizationInput(tenantId: string, dto: CreateOrganizationUnitDto) {
    const code = dto.code.trim();
    const name = dto.name.trim();
    if (!code || !name) throw new BadRequestException('组织编码和名称不能为空');
    const unitType = dto.unitType as OrganizationUnitType;
    if (unitType === OrganizationUnitType.HEADQUARTERS && dto.parentId) {
      throw new BadRequestException('总部不能有父组织');
    }
    if (unitType === OrganizationUnitType.REGION && !dto.areaId?.trim()) {
      throw new BadRequestException('区域组织必须绑定 areaId');
    }
    if (unitType === OrganizationUnitType.MERCHANT && !dto.merchantId?.trim()) {
      throw new BadRequestException('商家组织必须绑定 merchantId');
    }
    if (dto.parentId) await this.assertParent(tenantId, dto.parentId, unitType);
    return {
      code,
      name,
      unitType,
      parentId: dto.parentId?.trim() || null,
      areaId: dto.areaId?.trim() || null,
      merchantId: dto.merchantId?.trim() || null
    };
  }

  private async assertParent(tenantId: string, parentId: string, childType: OrganizationUnitType) {
    const parent = await this.prisma.organizationUnit.findFirst({
      where: { unitId: parentId, tenantId, isActive: 1, deletedAt: null },
      select: { unitType: true }
    });
    if (!parent) throw new BadRequestException('父组织不存在或已停用');
    const allowed =
      childType === OrganizationUnitType.REGION
        ? parent.unitType === OrganizationUnitType.HEADQUARTERS
        : childType === OrganizationUnitType.MERCHANT
          ? parent.unitType === OrganizationUnitType.HEADQUARTERS ||
            parent.unitType === OrganizationUnitType.REGION
          : false;
    if (!allowed) throw new BadRequestException('组织层级不合法');
  }

  private async resolveAssignments(tenantId: string, dto: ReplaceUserAccessDto) {
    const roleCodes = [...new Set(dto.assignments.map((assignment) => assignment.roleCode.trim()))];
    const roles = await this.prisma.role.findMany({
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
    if (missingRoles.length)
      throw new BadRequestException(`角色不存在或已停用: ${missingRoles.join(', ')}`);

    const resolved = [] as Array<{
      roleId: string;
      roleCode: string;
      scopeType: RoleScopeType;
      orgUnitId: string | null;
      legacyOrgUnit: { areaId: string | null; merchantId: string | null } | null;
      permissionCodes: string[];
    }>;
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
      const units = await this.prisma.organizationUnit.findMany({
        where: {
          tenantId,
          unitId: { in: [...new Set(scopedIds)] },
          isActive: 1,
          deletedAt: null
        },
        select: { unitId: true, areaId: true, merchantId: true }
      });
      const found = new Map(units.map((unit) => [unit.unitId, unit]));
      if (scopedIds.some((id) => !found.has(id)))
        throw new BadRequestException('权限范围组织不存在或已停用');
      for (const assignment of resolved) {
        assignment.legacyOrgUnit = assignment.orgUnitId
          ? (found.get(assignment.orgUnitId) ?? null)
          : null;
      }
    }
    for (const assignment of resolved) assignment.legacyOrgUnit ??= null;
    return resolved;
  }

  private async resolveMembershipIds(
    tenantId: string,
    userId: string,
    dto: ReplaceUserAccessDto,
    assignments: Array<{ orgUnitId: string | null }>
  ) {
    const existingIds =
      dto.organizationUnitIds === undefined
        ? await this.prisma.userOrganizationMembership.findMany({
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
    const units = await this.prisma.organizationUnit.findMany({
      where: { tenantId, unitId: { in: uniqueIds }, isActive: 1, deletedAt: null },
      select: { unitId: true }
    });
    if (units.length !== uniqueIds.length)
      throw new BadRequestException('组织成员关系包含无效组织');
    return uniqueIds;
  }

  private async hasActiveRole(userId: string, tenantId: string, code: string): Promise<boolean> {
    const rows = await this.prisma.userRoleAssignment.findMany({
      where: { tenantId, userId, isActive: 1, deletedAt: null, role: { code, deletedAt: null } },
      select: { assignmentId: true }
    });
    return rows.length > 0;
  }

  private async assertAnotherActiveAdmin(tenantId: string, userId: string) {
    const assignments = await this.prisma.userRoleAssignment.findMany({
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
    const activeUsers = await this.prisma.appUser.count({
      where: { tenantId, isActive: 1, userId: { in: assignments.map((row) => row.userId) } }
    });
    if (activeUsers === 0) throw new BadRequestException('不能移除最后一个有效 admin 角色');
  }

  private normalizeCode(code: string): string {
    const normalized = code.trim().toLowerCase();
    if (!/^[a-z][a-z0-9:_-]{1,63}$/.test(normalized)) {
      throw new BadRequestException('角色编码仅支持小写字母、数字、冒号、下划线和短横线');
    }
    return normalized;
  }

  private rethrowUnique(error: unknown, message: string): never {
    if (
      error instanceof Error &&
      /UNIQUE constraint failed|P2002|unique constraint/i.test(error.message)
    ) {
      throw new ConflictException(message);
    }
    throw error;
  }
}
