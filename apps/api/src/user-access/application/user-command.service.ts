import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { newEntityId } from '../../common/id';
import { toSqliteDateTime } from '../../common/sqlite-datetime';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto, UpdateUserRolesDto } from '../dto/update-user.dto';
import { syncIamProjection } from '../iam/iam-projection';
import { requireTenantId } from '../tenant-context';
import * as repo from '../repositories/user.repository';
import {
  assertScopeIdsExist,
  assertValidRoleBindings,
  type RoleBindingInput,
  type UserCommandOptions
} from './user-role-policy';

@Injectable()
export class UserCommandService {
  private readonly logger = new Logger(UserCommandService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto, opts: UserCommandOptions & { tenantId: string }) {
    const tenantId = requireTenantId(opts);
    assertValidRoleBindings(dto.roles, opts);
    await assertScopeIdsExist(this.prisma, dto.roles);
    if (await repo.checkUserExists(this.prisma, dto.username))
      throw new ConflictException(`用户名 ${dto.username} 已存在`);
    const userId = newEntityId('user');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const now = toSqliteDateTime();
    try {
      await this.prisma.$transaction(async (tx) => {
        await repo.insertUser(tx, {
          userId,
          username: dto.username,
          passwordHash,
          displayName: dto.displayName ?? dto.username,
          email: dto.email ?? null,
          phone: dto.phone ?? null,
          tenantId
        });
        await this.insertRoleBindings(tx, userId, dto.roles ?? [], now);
        await syncIamProjection(tx, userId, dto.roles ?? [], tenantId);
      });
    } catch (err: unknown) {
      if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message))
        throw new ConflictException(`用户名 ${dto.username} 已存在`);
      throw err;
    }
    return { success: true as const, userId, username: dto.username };
  }

  async update(id: string, dto: UpdateUserDto, tenantId: string) {
    const scopedTenantId = requireTenantId({ tenantId });
    const meta = await repo.getUserActiveMeta(this.prisma, id, scopedTenantId);
    if (!meta) throw new NotFoundException(`用户 ${id} 不存在`);
    const isAdminTarget =
      dto.isActive === false ? await repo.hasAdminRole(this.prisma, id, scopedTenantId) : false;
    const sets: string[] = [];
    const params: unknown[] = [];
    if (dto.displayName !== undefined) {
      sets.push('"displayName" = ?');
      params.push(dto.displayName);
    }
    if (dto.email !== undefined) {
      sets.push('"email" = ?');
      params.push(dto.email);
    }
    if (dto.phone !== undefined) {
      sets.push('"phone" = ?');
      params.push(dto.phone);
    }
    if (dto.password !== undefined) {
      sets.push('"passwordHash" = ?');
      params.push(await bcrypt.hash(dto.password, 10));
      sets.push('"tokenVersion" = COALESCE("tokenVersion", 0) + 1');
    }
    if (dto.isActive !== undefined) {
      sets.push('"isActive" = ?');
      params.push(dto.isActive ? 1 : 0);
      if (dto.isActive === false) sets.push('"tokenVersion" = COALESCE("tokenVersion", 0) + 1');
    }
    if (!sets.length) return { success: true as const, userId: id };
    if (dto.isActive === false && isAdminTarget) {
      const tenantPeerClause = ' AND u."tenantId" = ?';
      const existsWhere = ` AND EXISTS (SELECT 1 FROM "UserRoleBinding" urb INNER JOIN "AppUser" u ON u."userId" = urb."userId" WHERE urb."role" = 'admin' AND urb."userId" <> ? AND u."isActive" = 1${tenantPeerClause})`;
      const changed = await repo.updateUser(
        this.prisma,
        id,
        sets,
        params.slice(),
        scopedTenantId,
        existsWhere,
        [id, scopedTenantId]
      );
      if (!changed) {
        const latest = await repo.getUserActiveMeta(this.prisma, id, scopedTenantId);
        if (latest?.isActive) throw new BadRequestException('不能停用最后一个有效 admin 账号');
        return { success: true, userId: id, isActive: latest?.isActive };
      }
      return { success: true as const, userId: id, isActive: false as const };
    }
    const changed = await repo.updateUser(
      this.prisma,
      id,
      sets,
      params.slice(),
      scopedTenantId,
      undefined,
      []
    );
    if (!changed) throw new NotFoundException(`用户 ${id} 不存在`);
    return {
      success: true as const,
      userId: id,
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {})
    };
  }

  async deactivate(id: string, tenantId: string) {
    const scopedTenantId = requireTenantId({ tenantId });
    const meta = await repo.getUserActiveMeta(this.prisma, id, scopedTenantId);
    if (!meta) throw new NotFoundException(`用户 ${id} 不存在`);
    const isAdminTarget = await repo.hasAdminRole(this.prisma, id, scopedTenantId);
    const now = toSqliteDateTime();
    if (isAdminTarget && meta.isActive) {
      const tenantPeerClause = ' AND u."tenantId" = ?';
      const params: unknown[] = [now, id, scopedTenantId, id, scopedTenantId];
      const changed = Number(
        await this.prisma.$executeRawUnsafe(
          `UPDATE "AppUser" SET "isActive" = 0, "tokenVersion" = COALESCE("tokenVersion", 0) + 1, "updatedAt" = ? WHERE "userId" = ? AND "tenantId" = ? AND EXISTS (SELECT 1 FROM "UserRoleBinding" urb INNER JOIN "AppUser" u ON u."userId" = urb."userId" WHERE urb."role" = 'admin' AND urb."userId" <> ? AND u."isActive" = 1${tenantPeerClause})`,
          ...params
        )
      );
      if (!changed) {
        const latest = await repo.getUserActiveMeta(this.prisma, id, scopedTenantId);
        if (latest?.isActive) throw new BadRequestException('不能停用最后一个有效 admin 账号');
        return { success: true, userId: id, isActive: false };
      }
    } else {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "AppUser" SET "isActive" = 0, "tokenVersion" = COALESCE("tokenVersion", 0) + 1, "updatedAt" = ? WHERE "userId" = ? AND "tenantId" = ?`,
        now,
        id,
        scopedTenantId
      );
    }
    return { success: true as const, userId: id, isActive: false as const };
  }

  async updateRoles(
    id: string,
    input: UpdateUserRolesDto | RoleBindingInput[],
    opts: UserCommandOptions & { tenantId: string }
  ) {
    const tenantId = requireTenantId(opts);
    const roles = Array.isArray(input) ? input : input.roles;
    assertValidRoleBindings(roles, opts);
    await assertScopeIdsExist(this.prisma, roles);
    if (!(await repo.getUserActiveMeta(this.prisma, id, tenantId)))
      throw new NotFoundException(`用户 ${id} 不存在`);
    const currentlyAdmin = await repo.hasAdminRole(this.prisma, id, tenantId);
    const nextIsAdmin = roles.some((role) => role.role === 'admin');
    const now = toSqliteDateTime();
    await this.prisma.$transaction(async (tx) => {
      if (currentlyAdmin && !nextIsAdmin) {
        const tenantClause = ' AND u."tenantId" = ?';
        const remaining = await tx.$queryRawUnsafe<Array<{ cnt: number }>>(
          `SELECT COUNT(*) AS cnt
           FROM "UserRoleBinding" urb
           INNER JOIN "AppUser" u ON u."userId" = urb."userId"
           WHERE urb."role" = 'admin'
             AND urb."userId" <> ?
             AND u."isActive" = 1${tenantClause}`,
          id,
          tenantId
        );
        if (Number(remaining[0]?.cnt ?? 0) <= 0) {
          throw new BadRequestException('不能移除最后一个有效 admin 角色绑定');
        }
      }
      await tx.$executeRawUnsafe(`DELETE FROM "UserRoleBinding" WHERE "userId" = ?`, id);
      await this.insertRoleBindings(tx, id, roles, now);
      await syncIamProjection(tx, id, roles, tenantId);
      const changed = Number(
        await tx.$executeRawUnsafe(
          `UPDATE "AppUser" SET "tokenVersion" = COALESCE("tokenVersion", 0) + 1, "updatedAt" = ? WHERE "userId" = ? AND "tenantId" = ?`,
          now,
          id,
          tenantId
        )
      );
      if (!changed) throw new NotFoundException(`用户 ${id} 不存在`);
    });
    return { success: true as const, userId: id };
  }

  private async insertRoleBindings(
    tx: repo.Tx,
    userId: string,
    roles: RoleBindingInput[],
    now: string
  ): Promise<void> {
    if (!roles.length) return;
    const values = roles.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const params: unknown[] = [];
    for (const role of roles) {
      params.push(
        newEntityId('urb'),
        userId,
        role.role,
        role.scopeType ?? null,
        role.scopeId ?? null,
        now
      );
    }
    await tx.$executeRawUnsafe(
      `INSERT INTO "UserRoleBinding" ("id", "userId", "role", "scopeType", "scopeId", "createdAt") VALUES ${values}`,
      ...params
    );
  }

  async ensureEnvAdmin(adminUsername: string, adminPassword: string) {
    if (await repo.hasAnyUsers(this.prisma)) return false;
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const userId = process.env.ADMIN_USER_ID ?? 'admin';
    await this.prisma.$transaction(async (tx) => {
      await repo.ensureAdminUser(tx, {
        userId,
        username: adminUsername,
        passwordHash,
        displayName: adminUsername
      });
      await syncIamProjection(tx, userId, [{ role: 'admin' }]);
    });
    this.logger.log(`环境冷启动：已创建 admin 用户（userId=${userId}, username=${adminUsername}）`);
    return true;
  }
}
