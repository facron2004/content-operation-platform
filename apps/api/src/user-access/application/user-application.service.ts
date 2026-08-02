import {
  Injectable,
  Inject,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AppUser } from '@content/shared';
import { USER_ROLES } from '@content/shared';
import { newEntityId } from '../../common/id';
import { maskEmail, maskPhone } from '../../common/mask-pii';
import { clampListPage, clampListPageSize } from '../../common/sql-chunk';
import { toSqliteDateTime } from '../../common/sqlite-datetime';
import { likeContains } from '../../common/like-escape';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import * as repo from '../repositories/user.repository';

const ROLE_SET = new Set<string>(USER_ROLES);
const SCOPE_TYPES = new Set(['area', 'merchant']);
const UNRESTRICTED_GRANT_ROLES = new Set(['admin', 'platform_operator', 'auditor']);
const SCOPED_ROLES = new Set(['area_operator', 'merchant_operator']);
const HEX_RE = /^[0-9a-f]+$/i;
const LOGIN_TIMING_DUMMY_HASH = '$2b$10$gHRqYxnPKESX.Bkfo2nqcOmdcefHoB.O6PqBt1jbDzbhUVMHV16cu';

@Injectable()
export class UserAuthService {
  private readonly logger = new Logger(UserAuthService.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async validateUser(username: string, password: string) {
    const row = await repo.findUserByUsername(this.prisma, username);
    if (!row || Number(row.isActive) !== 1) {
      await this.burnCost(password);
      return null;
    }
    const isLegacy = isLegacyHashFn(row.passwordHash);
    const passwordOk = isLegacy
      ? verifyLegacyPasswordFn(password, row.passwordHash)
      : await bcrypt.compare(password, row.passwordHash);
    if (!passwordOk) return null;
    if (isLegacy) {
      const h = await bcrypt.hash(password, 10);
      await repo.updatePasswordHash(this.prisma, row.userId, h).catch(() => {});
    }
    const bindings = await repo.findRolesByUserId(this.prisma, row.userId);
    await repo.updateLastLogin(this.prisma, row.userId).catch(() => {});
    return {
      userId: row.userId,
      username: row.username,
      isActive: true,
      tokenVersion: Number(row.tokenVersion ?? 0),
      roles: bindings.map((b) => ({
        role: b.role,
        scopeType: b.scopeType ?? undefined,
        scopeId: b.scopeId ?? undefined
      }))
    };
  }

  private async burnCost(password: string): Promise<void> {
    try {
      await bcrypt.compare(password, LOGIN_TIMING_DUMMY_HASH);
    } catch {
      /* intentionally ignore timing burn errors */
    }
  }
}

@Injectable()
export class UserCommandService {
  private readonly logger = new Logger(UserCommandService.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(
    dto: CreateUserDto,
    opts?: { allowAdminRole?: boolean; allowUnrestrictedRoles?: boolean }
  ) {
    assertValidRoleBindings(dto.roles, opts);
    if (dto.roles?.length) await assertScopeIdsExist(this.prisma, dto.roles);
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
          phone: dto.phone ?? null
        });
        if (dto.roles?.length)
          for (const r of dto.roles)
            await tx.$executeRawUnsafe(
              `INSERT INTO "UserRoleBinding" ("id", "userId", "role", "scopeType", "scopeId", "createdAt") VALUES (?, ?, ?, ?, ?, ?)`,
              newEntityId('urb'),
              userId,
              r.role,
              r.scopeType ?? null,
              r.scopeId ?? null,
              now
            );
      });
    } catch (err: unknown) {
      if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message))
        throw new ConflictException(`用户名 ${dto.username} 已存在`);
      throw err;
    }
    return { success: true as const, userId, username: dto.username };
  }

  async update(id: string, dto: UpdateUserDto) {
    const meta = await repo.getUserActiveMeta(this.prisma, id);
    if (!meta) throw new NotFoundException(`用户 ${id} 不存在`);
    const isAdminTarget = dto.isActive === false ? await repo.hasAdminRole(this.prisma, id) : false;
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
      const ew =
        ' AND EXISTS (SELECT 1 FROM "UserRoleBinding" urb INNER JOIN "AppUser" u ON u."userId" = urb."userId" WHERE urb."role" = \'admin\' AND urb."userId" <> ? AND u."isActive" = 1)';
      const changed = await repo.updateUser(this.prisma, id, sets, params.slice(), ew);
      if (!changed) {
        const l = await repo.getUserActiveMeta(this.prisma, id);
        if (l?.isActive) throw new BadRequestException('不能停用最后一个有效 admin 账号');
        return { success: true, userId: id, isActive: l?.isActive };
      }
      return { success: true as const, userId: id, isActive: false as const };
    }
    const changed = await repo.updateUser(this.prisma, id, sets, params.slice());
    if (!changed) throw new NotFoundException(`用户 ${id} 不存在`);
    return {
      success: true as const,
      userId: id,
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {})
    };
  }

  async deactivate(id: string) {
    const meta = await repo.getUserActiveMeta(this.prisma, id);
    if (!meta) throw new NotFoundException(`用户 ${id} 不存在`);
    const isAdminTarget = await repo.hasAdminRole(this.prisma, id);
    const now = toSqliteDateTime();
    if (isAdminTarget && meta.isActive) {
      const params: unknown[] = [now, id, id];
      const changed = Number(
        await this.prisma.$executeRawUnsafe(
          `UPDATE "AppUser" SET "isActive" = 0, "tokenVersion" = COALESCE("tokenVersion", 0) + 1, "updatedAt" = ? WHERE "userId" = ? AND EXISTS (SELECT 1 FROM "UserRoleBinding" urb INNER JOIN "AppUser" u ON u."userId" = urb."userId" WHERE urb."role" = 'admin' AND urb."userId" <> ? AND u."isActive" = 1)`,
          ...params
        )
      );
      if (!changed) {
        const l = await repo.getUserActiveMeta(this.prisma, id);
        if (l?.isActive) throw new BadRequestException('不能停用最后一个有效 admin 账号');
        return { success: true, userId: id, isActive: false };
      }
    } else {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "AppUser" SET "isActive" = 0, "tokenVersion" = COALESCE("tokenVersion", 0) + 1, "updatedAt" = ? WHERE "userId" = ?`,
        now,
        id
      );
    }
    return { success: true as const, userId: id, isActive: false as const };
  }

  async updateRoles(id: string, roles: { role: string; scopeType?: string; scopeId?: string }[]) {
    if (!(await repo.getUserActiveMeta(this.prisma, id)))
      throw new NotFoundException(`用户 ${id} 不存在`);
    const now = toSqliteDateTime();
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`DELETE FROM "UserRoleBinding" WHERE "userId" = ?`, id);
      for (const r of roles)
        await tx.$executeRawUnsafe(
          `INSERT INTO "UserRoleBinding" ("id", "userId", "role", "scopeType", "scopeId", "createdAt") VALUES (?, ?, ?, ?, ?, ?)`,
          newEntityId('urb'),
          id,
          r.role,
          r.scopeType ?? null,
          r.scopeId ?? null,
          now
        );
      await tx.$executeRawUnsafe(
        `UPDATE "AppUser" SET "tokenVersion" = COALESCE("tokenVersion", 0) + 1, "updatedAt" = ? WHERE "userId" = ?`,
        now,
        id
      );
    });
    return { success: true as const, userId: id };
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
    });
    this.logger.log(`环境冷启动：已创建 admin 用户（userId=${userId}, username=${adminUsername}）`);
    return true;
  }
}

@Injectable()
export class UserQueryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findById(userId: string) {
    const row = await repo.findUserById(this.prisma, userId);
    if (!row) return null;
    const bindings = await repo.fetchRoleBindings(this.prisma, row.userId);
    return mapUserFn(row, bindings);
  }

  async findAuthStatus(userId: string) {
    return this.loadByColumn('userId', userId);
  }
  async findAuthStatusByUsername(username: string) {
    return this.loadByColumn('username', username);
  }

  private async loadByColumn(column: 'userId' | 'username', value: string) {
    const row = await repo.findAuthByColumn(this.prisma, column, value);
    if (!row) return null;
    const bindings = await repo.findRolesByUserId(this.prisma, row.userId);
    return {
      userId: row.userId,
      username: row.username,
      isActive: Number(row.isActive) === 1,
      tokenVersion: Number(row.tokenVersion ?? 0),
      roles: bindings.map((b) => ({
        role: b.role,
        scopeType: b.scopeType ?? undefined,
        scopeId: b.scopeId ?? undefined
      }))
    };
  }

  async list(page = 1, pageSize = 20, opts?: string | { keyword?: string; isActive?: number }) {
    const safePage = clampListPage(page, 100);
    const safePageSize = clampListPageSize(pageSize, 100, 20);
    const offset = (safePage - 1) * safePageSize;
    const filters = typeof opts === 'string' ? { keyword: opts } : (opts ?? {});
    const conditions: string[] = [];
    const params: unknown[] = [];
    const kw = typeof filters.keyword === 'string' ? filters.keyword.trim().slice(0, 100) : '';
    if (kw) {
      conditions.push(
        `("username" LIKE ? ESCAPE '\\' OR "displayName" LIKE ? ESCAPE '\\' OR "email" LIKE ? ESCAPE '\\' OR "userId" LIKE ? ESCAPE '\\')`
      );
      const p = likeContains(kw);
      params.push(p, p, p, p);
    }
    if (filters.isActive === 0 || filters.isActive === 1) {
      conditions.push('"isActive" = ?');
      params.push(filters.isActive);
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = await repo.countUsers(this.prisma, whereSql, params);
    const rows = await repo.listUsers(this.prisma, whereSql, params, safePageSize, offset);
    const userIds = rows.map((r) => r.userId);
    const allBindings = userIds.length ? await repo.batchRoleBindings(this.prisma, userIds) : [];
    const byUser = new Map<string, repo.RoleBindingRow[]>();
    for (const b of allBindings) {
      if (!byUser.has(b.userId)) byUser.set(b.userId, []);
      byUser.get(b.userId)!.push(b);
    }
    const users = rows.map((row) => {
      const raw = byUser.get(row.userId) ?? [];
      return mapUserFn(row, raw);
    });
    return { data: users, total, page: safePage, pageSize: safePageSize };
  }

  async hasUnrestrictedPeerRole(userId: string) {
    return repo.hasUnrestrictedPeerRole(this.prisma, userId);
  }
  async hasAdminRole(userId: string) {
    return repo.hasAdminRole(this.prisma, userId);
  }
  async hasAnyUsers() {
    return repo.hasAnyUsers(this.prisma);
  }
}

function assertValidRoleBindings(
  roles: { role: string; scopeType?: string; scopeId?: string }[] | undefined,
  opts?: { allowAdminRole?: boolean; allowUnrestrictedRoles?: boolean }
): void {
  if (!roles?.length) return;
  const au = Boolean(opts?.allowUnrestrictedRoles ?? opts?.allowAdminRole);
  for (const r of roles) {
    if (!ROLE_SET.has(r.role)) throw new BadRequestException(`无效角色: ${r.role}`);
    if (UNRESTRICTED_GRANT_ROLES.has(r.role) && !au)
      throw new BadRequestException(`仅 admin 可授予无数据范围限制角色: ${r.role}`);
    if (r.scopeType != null && !SCOPE_TYPES.has(r.scopeType))
      throw new BadRequestException(`无效 scopeType: ${r.scopeType}`);
    if (SCOPED_ROLES.has(r.role)) {
      const e = r.role === 'area_operator' ? 'area' : 'merchant';
      if (r.scopeType !== e || !r.scopeId?.trim())
        throw new BadRequestException(`${r.role} 必须提供 scopeType=${e} 与 scopeId`);
    }
  }
}

async function assertScopeIdsExist(
  prisma: repo.Tx,
  roles: { role: string; scopeType?: string; scopeId?: string }[] | undefined
): Promise<void> {
  if (!roles?.length) return;
  const mids = new Set<string>();
  const aids = new Set<string>();
  for (const r of roles) {
    if (!SCOPED_ROLES.has(r.role)) continue;
    const s = r.scopeId?.trim();
    if (!s) continue;
    if (r.scopeType === 'merchant') mids.add(s);
    else if (r.scopeType === 'area') aids.add(s);
  }
  if (mids.size) {
    const ids = [...mids].slice(0, 200);
    const ph = ids.map(() => '?').join(',');
    const rows = await prisma.$queryRawUnsafe<Array<{ merchantId: string }>>(
      `SELECT "merchantId" FROM "Merchant" WHERE "merchantId" IN (${ph})`,
      ...ids
    );
    const f = new Set(rows.map((r) => r.merchantId));
    for (const id of ids) {
      if (!f.has(id)) throw new BadRequestException(`商家 scopeId 不存在: ${id}`);
    }
  }
  if (aids.size) {
    const ids = [...aids].slice(0, 100);
    const ph = ids.map(() => '?').join(',');
    const [ma, pa] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ areaId: string }>>(
        `SELECT DISTINCT "areaId" FROM "Merchant" WHERE "areaId" IN (${ph})`,
        ...ids
      ),
      prisma.$queryRawUnsafe<Array<{ areaId: string }>>(
        `SELECT DISTINCT "areaId" FROM "ContentPackage" WHERE "areaId" IN (${ph})`,
        ...ids
      )
    ]);
    const f = new Set([...ma.map((r) => r.areaId), ...pa.map((r) => r.areaId)]);
    for (const id of ids) {
      if (!f.has(id)) throw new BadRequestException(`区域 scopeId 不存在: ${id}`);
    }
  }
}

function isLegacyHashFn(stored: string): boolean {
  const i = stored.indexOf(':');
  return (
    i > 0 &&
    HEX_RE.test(stored.slice(0, i)) &&
    HEX_RE.test(stored.slice(i + 1)) &&
    stored.slice(i + 1).length === 64
  );
}
function verifyLegacyPasswordFn(password: string, stored: string): boolean {
  const i = stored.indexOf(':');
  return (
    createHash('sha256')
      .update(stored.slice(0, i) + password)
      .digest('hex') === stored.slice(i + 1)
  );
}

function mapUserFn(row: repo.UserPublicRow, bindings: repo.RoleBindingRow[]): AppUser {
  return {
    userId: row.userId,
    username: row.username,
    displayName: row.displayName,
    email: maskEmail(row.email ?? '') || undefined,
    phone: maskPhone(row.phone ?? '') || undefined,
    isActive: Number(row.isActive) === 1,
    lastLoginAt: row.lastLoginAt ?? undefined,
    createdAt: row.createdAt,
    roles: bindings.map((b) => ({
      id: b.id,
      userId: b.userId,
      role: b.role as AppUser['roles'][number]['role'],
      scopeType: (b.scopeType ?? undefined) as any,
      scopeId: b.scopeId ?? undefined
    }))
  };
}
