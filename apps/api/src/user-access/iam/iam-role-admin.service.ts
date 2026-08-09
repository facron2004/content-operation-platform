import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CloneIamRoleDto, CreateIamRoleDto, UpdateIamRoleDto } from './iam.dto';
import { newEntityId } from '../../common/id';
import { IamAccessService } from './iam-access.service';
import { JwtStrategy } from '../../auth/jwt.strategy';
import { expandIamPermissionCodes } from './iam.catalog';

type IamTransaction = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

@Injectable()
export class IamRoleAdminService {
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
    const normalized = expandIamPermissionCodes(codes);
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
    const normalized = expandIamPermissionCodes(permissionCodes);
    if (normalized.includes('iam:root')) {
      throw new ForbiddenException('iam:root 仅系统 admin 可授予');
    }
    const owned = new Set(access.permissions);
    if (normalized.some((code) => !owned.has(code))) {
      throw new ForbiddenException('不能授予当前操作者未拥有的权限');
    }
  }

  private async replaceRolePermissions(
    tx: IamTransaction,
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
