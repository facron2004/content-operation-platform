import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import type { AppUser, UserRoleBinding } from '@content/shared';
import { USER_ROLES } from '@content/shared';
import { newEntityId } from '../common/id';
import { maskEmail, maskPhone } from '../common/mask-pii';
import { clampListPage, clampListPageSize } from '../common/sql-chunk';
import { toSqliteDateTime } from '../common/sqlite-datetime';
import { likeContains } from '../common/like-escape';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateUserRolesDto } from './dto/update-user.dto';
import { syncIamProjection } from './iam/iam-projection';

const ROLE_SET = new Set<string>(USER_ROLES);
const SCOPE_TYPES = new Set(['area', 'merchant']);
/** Roles that grant unrestricted (platform-wide) data scope — admin-only to mint. */
const UNRESTRICTED_GRANT_ROLES = new Set(['admin', 'platform_operator', 'auditor']);
/** Roles that require a concrete area/merchant scope binding. */
const SCOPED_ROLES = new Set(['area_operator', 'merchant_operator']);

function assertValidRoleBindings(
  roles: { role: string; scopeType?: string; scopeId?: string }[] | undefined,
  opts?: { allowAdminRole?: boolean; allowUnrestrictedRoles?: boolean }
): void {
  if (!roles?.length) return;
  // allowAdminRole remains the admin-actor flag; unrestricted peer roles share that gate.
  const allowUnrestricted = Boolean(opts?.allowUnrestrictedRoles ?? opts?.allowAdminRole);
  for (const r of roles) {
    if (!ROLE_SET.has(r.role)) {
      throw new BadRequestException(`无效角色: ${r.role}`);
    }
    if (UNRESTRICTED_GRANT_ROLES.has(r.role) && !allowUnrestricted) {
      throw new BadRequestException(`仅 admin 可授予无数据范围限制角色: ${r.role}`);
    }
    if (r.scopeType != null && !SCOPE_TYPES.has(r.scopeType)) {
      throw new BadRequestException(`无效 scopeType: ${r.scopeType}`);
    }
    // Scoped operators must carry a matching scopeType + non-empty scopeId.
    if (SCOPED_ROLES.has(r.role)) {
      const expectedScope = r.role === 'area_operator' ? 'area' : 'merchant';
      if (r.scopeType !== expectedScope || !r.scopeId?.trim()) {
        throw new BadRequestException(`${r.role} 必须提供 scopeType=${expectedScope} 与 scopeId`);
      }
    }
  }
}

/**
 * Ensure scoped role scopeIds point at real entities so operators cannot mint
 * phantom area/merchant scopes that silently empty their data window or collide later.
 * - merchant: Merchant.merchantId (one batched IN ≤200)
 * - area: observed via Merchant.areaId OR ContentPackage.areaId (two batched IN ≤100)
 *   — no Area master table. Parity with campaign.assertScopeIdsExist batching.
 */
async function assertScopeIdsExist(
  prisma: {
    $queryRawUnsafe: <T>(query: string, ...values: unknown[]) => Promise<T>;
  },
  roles: { role: string; scopeType?: string; scopeId?: string }[] | undefined
): Promise<void> {
  if (!roles?.length) return;
  const merchantIds = new Set<string>();
  const areaIds = new Set<string>();
  for (const r of roles) {
    if (!SCOPED_ROLES.has(r.role)) continue;
    const scopeId = r.scopeId?.trim();
    if (!scopeId) continue;
    if (r.scopeType === 'merchant') merchantIds.add(scopeId);
    else if (r.scopeType === 'area') areaIds.add(scopeId);
  }

  if (merchantIds.size) {
    const ids = [...merchantIds].slice(0, 200);
    const ph = ids.map(() => '?').join(',');
    const rows = await prisma.$queryRawUnsafe<Array<{ merchantId: string }>>(
      `SELECT "merchantId" FROM "Merchant" WHERE "merchantId" IN (${ph})`,
      ...ids
    );
    const found = new Set(rows.map((row) => row.merchantId));
    for (const id of ids) {
      if (!found.has(id)) {
        throw new BadRequestException(`商家 scopeId 不存在: ${id}`);
      }
    }
  }

  if (areaIds.size) {
    const ids = [...areaIds].slice(0, 100);
    const ph = ids.map(() => '?').join(',');
    const [merchantAreas, pkgAreas] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ areaId: string }>>(
        `SELECT DISTINCT "areaId" FROM "Merchant" WHERE "areaId" IN (${ph})`,
        ...ids
      ),
      prisma.$queryRawUnsafe<Array<{ areaId: string }>>(
        `SELECT DISTINCT "areaId" FROM "ContentPackage" WHERE "areaId" IN (${ph})`,
        ...ids
      )
    ]);
    const found = new Set([
      ...merchantAreas.map((row) => row.areaId),
      ...pkgAreas.map((row) => row.areaId)
    ]);
    for (const id of ids) {
      if (!found.has(id)) {
        throw new BadRequestException(`区域 scopeId 不存在: ${id}`);
      }
    }
  }
}

const HEX_RE = /^[0-9a-f]+$/i;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/** Detect legacy sha256 salt:hash format (salt:sha256hex). */
export function isLegacyHash(stored: string): boolean {
  const idx = stored.indexOf(':');
  if (idx <= 0) return false;
  const salt = stored.slice(0, idx);
  const hash = stored.slice(idx + 1);
  return HEX_RE.test(salt) && HEX_RE.test(hash) && hash.length === 64;
}

/** Verify against legacy sha256(salt + password) format. */
export function verifyLegacyPassword(password: string, stored: string): boolean {
  const idx = stored.indexOf(':');
  const salt = stored.slice(0, idx);
  const hash = stored.slice(idx + 1);
  return (
    createHash('sha256')
      .update(salt + password)
      .digest('hex') === hash
  );
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  return bcrypt.compare(password, stored);
}

/**
 * Fixed bcrypt cost sink for login paths that never load a real passwordHash
 * (unknown username / inactive account). Without this, missing users return
 * ~instantly while wrong-password attempts pay bcrypt.compare (~100ms) —
 * a classic username-enumeration timing side channel over /api/auth/login.
 * Hash of a random constant; never a real account password.
 */
const LOGIN_TIMING_DUMMY_HASH = '$2b$10$gHRqYxnPKESX.Bkfo2nqcOmdcefHoB.O6PqBt1jbDzbhUVMHV16cu';

/** Burn one bcrypt.compare so miss/inactive login latency matches real verifies. */
export async function burnPasswordVerifyCost(password: string): Promise<void> {
  try {
    await verifyPassword(password, LOGIN_TIMING_DUMMY_HASH);
  } catch {
    // Dummy hash is always well-formed; swallow anyway so login never 500s.
  }
}

/**
 * List/detail columns — never SELECT passwordHash or tokenVersion into admin
 * list/profile paths. Session epoch is auth-only (JWT mint/validate/refresh
 * via findAuthStatus / validateUser; residual #169 mutators are slim shells).
 */
const USER_LIST_COLUMNS = `"userId", "username", "displayName", "email", "phone", "isActive", "lastLoginAt", "createdAt", "updatedAt"`;

interface UserPublicRow {
  userId: string;
  username: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  isActive: number;
  tokenVersion?: number | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RoleBindingRow {
  id: string;
  userId: string;
  role: string;
  scopeType: string | null;
  scopeId: string | null;
  createdAt: string;
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Validate username/password and return auth fields + roles if valid.
   * Returns null if user not found, inactive, or password mismatched.
   * Only path that SELECTs passwordHash.
   *
   * Residual #145: login only needs userId/username/tokenVersion/roles for JWT mint —
   * drops email/phone/displayName/lastLoginAt/createdAt and binding id/createdAt.
   * Shape is still signUserToken-compatible ({ userId, username, roles, tokenVersion }).
   */
  async validateUser(
    username: string,
    password: string
  ): Promise<{
    userId: string;
    username: string;
    isActive: boolean;
    tokenVersion: number;
    tenantId: string;
    roles: Array<{ role: string; scopeType?: string; scopeId?: string }>;
  } | null> {
    // Residual #145: slim auth columns + passwordHash only (no PII / list columns).
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        userId: string;
        username: string;
        isActive: number | boolean;
        tokenVersion: number | null;
        passwordHash: string;
      }>
    >(
      `SELECT "userId", "username", "isActive", "tokenVersion", "passwordHash"
       FROM "AppUser" WHERE "username" = ?`,
      username
    );
    const row = rows[0];
    // Missing or inactive: still pay bcrypt cost so login latency does not
    // reveal whether the username exists (Residual #46 timing equalization).
    if (!row || Number(row.isActive) !== 1) {
      await burnPasswordVerifyCost(password);
      return null;
    }

    // Support transparent migration: legacy sha256 salt:hash → bcrypt
    const isLegacy = isLegacyHash(row.passwordHash);
    const passwordOk = isLegacy
      ? verifyLegacyPassword(password, row.passwordHash)
      : await verifyPassword(password, row.passwordHash);
    if (!passwordOk) return null;

    // Rehash legacy password on successful login (transparent migration)
    if (isLegacy) {
      const newHash = await hashPassword(password);
      await this.prisma
        .$executeRawUnsafe(
          `UPDATE "AppUser" SET "passwordHash" = ? WHERE "userId" = ?`,
          newHash,
          row.userId
        )
        .catch(() => {});
      this.logger.log(
        `Upgraded password hash for user ${row.username} from legacy sha256 to bcrypt`
      );
    }

    // Residual #145: role/scope only (parity with findAuthStatus bindings).
    const bindings = await this.prisma.$queryRawUnsafe<
      Array<{ role: string; scopeType: string | null; scopeId: string | null }>
    >(
      `SELECT "role", "scopeType", "scopeId" FROM "UserRoleBinding"
       WHERE "userId" = ? ORDER BY "createdAt" ASC`,
      row.userId
    );

    // Update lastLoginAt
    await this.prisma
      .$executeRawUnsafe(
        `UPDATE "AppUser" SET "lastLoginAt" = ? WHERE "userId" = ?`,
        toSqliteDateTime(),
        row.userId
      )
      .catch(() => {});

    return {
      userId: row.userId,
      username: row.username,
      isActive: true,
      tokenVersion: Number(row.tokenVersion ?? 0),
      tenantId: await this.findTenantId(row.userId),
      roles: bindings.map((b) => ({
        role: b.role,
        scopeType: b.scopeType ?? undefined,
        scopeId: b.scopeId ?? undefined
      }))
    };
  }

  /**
   * Fetch public user profile plus role bindings for a given userId.
   * Admin /me and profile paths — includes masked PII + displayName.
   * Residual #149: USER_LIST_COLUMNS only — tokenVersion is auth-only
   * (JWT mint/validate/refresh via findAuthStatus; mutators are slim shells #169).
   */
  async findById(userId: string): Promise<AppUser | null> {
    const rows = await this.prisma.$queryRawUnsafe<UserPublicRow[]>(
      `SELECT ${USER_LIST_COLUMNS} FROM "AppUser" WHERE "userId" = ?`,
      userId
    );
    const row = rows[0];
    if (!row) return null;

    const bindings = await this.fetchRoleBindings(row.userId);
    return this.mapUser(row, bindings);
  }

  /**
   * Residual #143: JWT validate / refresh / localSession status projection.
   * Drops email/phone/displayName/lastLoginAt/createdAt/updatedAt and binding ids.
   * Auth only needs isActive + tokenVersion + role/scope for req.user + re-sign.
   */
  async findAuthStatus(userId: string): Promise<{
    userId: string;
    username: string;
    isActive: boolean;
    tokenVersion: number;
    tenantId: string;
    roles: Array<{ role: string; scopeType?: string; scopeId?: string }>;
  } | null> {
    return this.loadAuthStatusByColumn('userId', userId);
  }

  /**
   * Residual #144: username-keyed status projection for localSession fallback
   * when userId=admin is missing but ADMIN_USERNAME row exists under another id.
   */
  async findAuthStatusByUsername(username: string): Promise<{
    userId: string;
    username: string;
    isActive: boolean;
    tokenVersion: number;
    tenantId: string;
    roles: Array<{ role: string; scopeType?: string; scopeId?: string }>;
  } | null> {
    return this.loadAuthStatusByColumn('username', username);
  }

  private async loadAuthStatusByColumn(
    column: 'userId' | 'username',
    value: string
  ): Promise<{
    userId: string;
    username: string;
    isActive: boolean;
    tokenVersion: number;
    tenantId: string;
    roles: Array<{ role: string; scopeType?: string; scopeId?: string }>;
  } | null> {
    const col = column === 'userId' ? '"userId"' : '"username"';
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        userId: string;
        username: string;
        isActive: number | boolean;
        tokenVersion: number | null;
      }>
    >(
      `SELECT "userId", "username", "isActive", "tokenVersion"
       FROM "AppUser" WHERE ${col} = ?`,
      value
    );
    const row = rows[0];
    if (!row) return null;
    const bindings = await this.prisma.$queryRawUnsafe<
      Array<{ role: string; scopeType: string | null; scopeId: string | null }>
    >(
      `SELECT "role", "scopeType", "scopeId" FROM "UserRoleBinding"
       WHERE "userId" = ? ORDER BY "createdAt" ASC`,
      row.userId
    );
    return {
      userId: row.userId,
      username: row.username,
      isActive: Number(row.isActive) === 1,
      tokenVersion: Number(row.tokenVersion ?? 0),
      tenantId: await this.findTenantId(row.userId),
      roles: bindings.map((b) => ({
        role: b.role,
        scopeType: b.scopeType ?? undefined,
        scopeId: b.scopeId ?? undefined
      }))
    };
  }

  /** Read the additive tenant column without breaking pre-0007 instances. */
  private async findTenantId(userId: string): Promise<string> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ tenantId?: string | null }>>(
        `SELECT "tenantId" FROM "AppUser" WHERE "userId" = ?`,
        userId
      );
      return rows[0]?.tenantId ?? 'tenant_default';
    } catch {
      return 'tenant_default';
    }
  }

  /**
   * Residual #115: peer-gate probe for non-admin mutates.
   * True when target holds any unrestricted role (admin / platform_operator / auditor).
   * Avoids full AppUser + bindings load just for the lateral-demotion gate.
   * Missing user → false (service path still 404s on its own existence check).
   */
  async hasUnrestrictedPeerRole(userId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ role: string }>>(
      `SELECT "role" FROM "UserRoleBinding"
       WHERE "userId" = ?
         AND "role" IN ('admin', 'platform_operator', 'auditor')
       LIMIT 1`,
      userId
    );
    // Filter client-side too — unit mocks may return full binding lists.
    return rows.some(
      (r) => r.role === 'admin' || r.role === 'platform_operator' || r.role === 'auditor'
    );
  }

  /**
   * Residual #117: existence + isActive only (no bindings / PII columns).
   * Pre-mutate gates never need the full profile.
   */
  private async getUserActiveMeta(id: string): Promise<{ isActive: boolean }> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ isActive: number | boolean }>>(
      `SELECT "isActive" FROM "AppUser" WHERE "userId" = ?`,
      id
    );
    if (!rows.length) throw new NotFoundException(`用户 ${id} 不存在`);
    return { isActive: Number(rows[0].isActive) === 1 };
  }

  /** admin binding only — last-admin / demotion gates. */
  private async hasAdminRole(userId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ role: string }>>(
      `SELECT "role" FROM "UserRoleBinding"
       WHERE "userId" = ? AND "role" = 'admin'
       LIMIT 1`,
      userId
    );
    // Client-side filter for loose unit mocks that return all bindings.
    return rows.some((r) => r.role === 'admin');
  }

  /**
   * True when any AppUser row exists. Used to shut down cold-start env-admin JWT
   * once the user table is populated (even if userId=admin was never seeded).
   * Residual #147: existence-only probe — SQLite COUNT(*) ignores LIMIT and
   * still scans the full table; SELECT 1 LIMIT 1 short-circuits after first row.
   */
  async hasAnyUsers(): Promise<boolean> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ ok: number }>>(
      `SELECT 1 AS ok FROM "AppUser" LIMIT 1`
    );
    return rows.length > 0;
  }

  /** List users with pagination and role bindings. Residual #205/#208: keyword + isActive. */
  async list(page = 1, pageSize = 20, opts?: string | { keyword?: string; isActive?: number }) {
    // Defense-in-depth: clamp even if a caller bypasses the controller.
    const safePage = clampListPage(page, 100);
    const safePageSize = clampListPageSize(pageSize, 100, 20);
    const offset = (safePage - 1) * safePageSize;

    // Residual #205 legacy: third arg used to be bare keyword string.
    const filters = typeof opts === 'string' ? { keyword: opts } : (opts ?? {});

    const conditions: string[] = [];
    const params: unknown[] = [];
    const kw = typeof filters.keyword === 'string' ? filters.keyword.trim().slice(0, 100) : '';
    if (kw) {
      // ESCAPE so user %/_ cannot broaden matches; search username/displayName/email/userId.
      conditions.push(
        `("username" LIKE ? ESCAPE '\\' OR "displayName" LIKE ? ESCAPE '\\' OR "email" LIKE ? ESCAPE '\\' OR "userId" LIKE ? ESCAPE '\\')`
      );
      const pattern = likeContains(kw);
      params.push(pattern, pattern, pattern, pattern);
    }
    // Residual #208: isActive 0|1 (SQLite stores 0/1).
    if (filters.isActive === 0 || filters.isActive === 1) {
      conditions.push(`"isActive" = ?`);
      params.push(filters.isActive);
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await this.prisma.$queryRawUnsafe<[{ count: number }]>(
      `SELECT COUNT(*) as count FROM "AppUser" ${whereSql}`,
      ...params
    );
    const total = Number(countRows[0]?.count ?? 0);

    // List omits tokenVersion — admin UIs never need session epoch; controller
    // publicUser also strips it as defense-in-depth if auth paths leak it.
    const rows = await this.prisma.$queryRawUnsafe<UserPublicRow[]>(
      `SELECT ${USER_LIST_COLUMNS} FROM "AppUser" ${whereSql} ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`,
      ...params,
      safePageSize,
      offset
    );

    // Batch fetch role bindings for all users (fix N+1)
    const userIds = rows.map((r) => r.userId);
    const allBindings =
      userIds.length > 0
        ? await this.prisma.$queryRawUnsafe<RoleBindingRow[]>(
            `SELECT "id", "userId", "role", "scopeType", "scopeId", "createdAt" FROM "UserRoleBinding" WHERE "userId" IN (${userIds.map(() => '?').join(',')}) ORDER BY "createdAt" ASC`,
            ...userIds
          )
        : [];
    const bindingsByUser = new Map<string, RoleBindingRow[]>();
    for (const b of allBindings) {
      if (!bindingsByUser.has(b.userId)) bindingsByUser.set(b.userId, []);
      bindingsByUser.get(b.userId)!.push(b);
    }

    const users = rows.map((row) => {
      const raw = bindingsByUser.get(row.userId) ?? [];
      const bindings = raw.map((r) => ({
        id: r.id,
        userId: r.userId,
        role: r.role as UserRoleBinding['role'],
        scopeType: r.scopeType as 'area' | 'merchant' | undefined,
        scopeId: r.scopeId ?? undefined
      }));
      return this.mapUser(row, bindings);
    });

    return { data: users, total, page: safePage, pageSize: safePageSize };
  }

  /**
   * Residual #170: SPA UserManagementView.handleCreate discards body + load(true).
   * Slim success shell — no mapUser / PII mask / bindings synthesis on response
   * (bindings still written; list reload hydrates real roles).
   */
  async create(
    dto: CreateUserDto,
    opts?: { allowAdminRole?: boolean; allowUnrestrictedRoles?: boolean }
  ): Promise<{ success: true; userId: string; username: string }> {
    assertValidRoleBindings(dto.roles, opts);
    await assertScopeIdsExist(this.prisma, dto.roles);

    // Check existing username
    const existing = await this.prisma.$queryRawUnsafe<Array<{ userId: string }>>(
      `SELECT "userId" FROM "AppUser" WHERE "username" = ?`,
      dto.username
    );
    if (existing.length > 0) {
      throw new ConflictException(`用户名 ${dto.username} 已存在`);
    }

    const userId = this.generateId();
    const passwordHash = await hashPassword(dto.password);
    const displayName = dto.displayName ?? dto.username;
    const email = dto.email ?? null;
    const phone = dto.phone ?? null;

    const now = toSqliteDateTime();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `INSERT INTO "AppUser" ("userId", "username", "passwordHash", "displayName", "email", "phone", "isActive", "tokenVersion", "createdAt", "updatedAt")
           VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
          userId,
          dto.username,
          passwordHash,
          displayName,
          email,
          phone,
          now,
          now
        );

        // Create role bindings if provided (multi-row INSERT — residual #95).
        // Residual #170: bindings still written; response is slim shell only.
        if (dto.roles && dto.roles.length > 0) {
          await this.insertRoleBindings(tx, userId, dto.roles, now);
        }
        await syncIamProjection(tx, userId, dto.roles ?? []);
      });
    } catch (err) {
      // Concurrent create of the same username races past the pre-check; unique wins.
      const msg = err instanceof Error ? err.message : String(err ?? '');
      if (/UNIQUE constraint failed|unique constraint|SQLITE_CONSTRAINT_UNIQUE/i.test(msg)) {
        throw new ConflictException(`用户名 ${dto.username} 已存在`);
      }
      throw err;
    }

    return { success: true as const, userId, username: dto.username };
  }

  /**
   * Residual #169: SPA UserManagementView discards mutate bodies + reloads list
   * (createUser / deactivateUser; update/roles UI still list-reload pattern).
   * Slim success shells — no full-row free-form payload / mapUser / loadUserShell.
   */
  async update(
    id: string,
    dto: UpdateUserDto
  ): Promise<{ success: true; userId: string; isActive?: boolean }> {
    // Residual #117: existence only; admin role only when deactivating.
    await this.getUserActiveMeta(id);
    const isAdminTarget = dto.isActive === false ? await this.hasAdminRole(id) : false;

    const sets: string[] = [];
    const params: unknown[] = [];

    if (dto.displayName !== undefined) {
      sets.push(`"displayName" = ?`);
      params.push(dto.displayName);
    }
    if (dto.email !== undefined) {
      sets.push(`"email" = ?`);
      params.push(dto.email);
    }
    if (dto.phone !== undefined) {
      sets.push(`"phone" = ?`);
      params.push(dto.phone);
    }
    if (dto.password !== undefined) {
      sets.push(`"passwordHash" = ?`);
      params.push(await hashPassword(dto.password));
      // Bump session epoch so live JWTs + refresh refuse the pre-reset token.
      sets.push(`"tokenVersion" = COALESCE("tokenVersion", 0) + 1`);
    }
    if (dto.isActive !== undefined) {
      sets.push(`"isActive" = ?`);
      params.push(dto.isActive ? 1 : 0);
      // Deactivate must hard-kill live JWTs across instances (status cache is soft).
      if (dto.isActive === false) {
        sets.push(`"tokenVersion" = COALESCE("tokenVersion", 0) + 1`);
      }
    }

    if (sets.length > 0) {
      sets.push(`"updatedAt" = ?`);
      const now = toSqliteDateTime();
      // Residual #169: $executeRawUnsafe changed-rows probe (no fat free-form payload).
      if (dto.isActive === false && isAdminTarget) {
        // Deactivating an admin must stay atomic vs concurrent peer deactivates —
        // pin EXISTS(other active admin) so two last-admins cannot both succeed.
        params.push(now, id);
        const changed = Number(
          await this.prisma.$executeRawUnsafe(
            `UPDATE "AppUser" SET ${sets.join(', ')}
             WHERE "userId" = ?
               AND EXISTS (
                 SELECT 1
                 FROM "UserRoleBinding" urb
                 INNER JOIN "AppUser" u ON u."userId" = urb."userId"
                 WHERE urb."role" = 'admin'
                   AND urb."userId" <> ?
                   AND u."isActive" = 1
               )`,
            ...params,
            id
          )
        );
        if (!changed) {
          // Slim re-probe for error message — avoid full profile on the rare race arm.
          const latest = await this.getUserActiveMeta(id);
          if (latest.isActive && (await this.hasAdminRole(id))) {
            throw new BadRequestException('不能停用最后一个有效 admin 账号');
          }
          // Already inactive or no longer admin — slim success shell (SPA discards).
          return {
            success: true as const,
            userId: id,
            isActive: latest.isActive
          };
        }
        return { success: true as const, userId: id, isActive: false as const };
      }

      params.push(now, id);
      const changed = Number(
        await this.prisma.$executeRawUnsafe(
          `UPDATE "AppUser" SET ${sets.join(', ')} WHERE "userId" = ?`,
          ...params
        )
      );
      if (!changed) throw new NotFoundException(`用户 ${id} 不存在`);
      return {
        success: true as const,
        userId: id,
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {})
      };
    }

    // Empty DTO — SPA discards body; no re-SELECT needed.
    return { success: true as const, userId: id };
  }

  /** Deactivate a user (isActive = false). Residual #169: slim success shell. */
  async deactivate(id: string): Promise<{ success: true; userId: string; isActive: false }> {
    // Residual #117: isActive + admin-role probes (no full profile pre-load).
    const meta = await this.getUserActiveMeta(id);
    const isAdminTarget = await this.hasAdminRole(id);

    if (isAdminTarget && meta.isActive) {
      // Atomic last-admin guard: conditional UPDATE only succeeds when another
      // active admin still exists (closes A/B mutual-deactivate TOCTOU).
      const changed = Number(
        await this.prisma.$executeRawUnsafe(
          `UPDATE "AppUser"
           SET "isActive" = 0,
               "tokenVersion" = COALESCE("tokenVersion", 0) + 1,
               "updatedAt" = ?
           WHERE "userId" = ?
             AND "isActive" = 1
             AND EXISTS (
               SELECT 1
               FROM "UserRoleBinding" urb
               INNER JOIN "AppUser" u ON u."userId" = urb."userId"
               WHERE urb."role" = 'admin'
                 AND urb."userId" <> ?
                 AND u."isActive" = 1
             )`,
          toSqliteDateTime(),
          id,
          id
        )
      );
      if (!changed) {
        const latest = await this.getUserActiveMeta(id);
        if (!latest.isActive) {
          // Already-inactive race — slim success shell (SPA discards).
          return { success: true as const, userId: id, isActive: false as const };
        }
        throw new BadRequestException('不能停用最后一个有效 admin 账号');
      }
      return { success: true as const, userId: id, isActive: false as const };
    }

    const changed = Number(
      await this.prisma.$executeRawUnsafe(
        `UPDATE "AppUser"
         SET "isActive" = 0,
             "tokenVersion" = COALESCE("tokenVersion", 0) + 1,
             "updatedAt" = ?
         WHERE "userId" = ?`,
        toSqliteDateTime(),
        id
      )
    );
    if (!changed) throw new NotFoundException(`用户 ${id} 不存在`);
    return { success: true as const, userId: id, isActive: false as const };
  }

  /**
   * Update role bindings for a user (replaces all existing bindings).
   * Residual #169: slim success shell — SPA reloads list and discards body.
   */
  async updateRoles(
    id: string,
    dto: UpdateUserRolesDto,
    opts?: { allowAdminRole?: boolean; allowUnrestrictedRoles?: boolean }
  ): Promise<{ success: true; userId: string }> {
    assertValidRoleBindings(dto.roles, opts);
    await assertScopeIdsExist(this.prisma, dto.roles);

    // Residual #117: existence + admin-role only (no full profile pre-load).
    await this.getUserActiveMeta(id);
    const currentlyAdmin = await this.hasAdminRole(id);
    const nextIsAdmin = (dto.roles ?? []).some((r) => r.role === 'admin');

    await this.prisma.$transaction(async (tx) => {
      // Last-admin guard: do not strip the final active admin binding (self-lockout /
      // platform lockout until env-admin / DB repair). Re-check inside the tx.
      if (currentlyAdmin && !nextIsAdmin) {
        const remaining = await tx.$queryRawUnsafe<Array<{ cnt: number }>>(
          `SELECT COUNT(*) AS cnt
           FROM "UserRoleBinding" urb
           INNER JOIN "AppUser" u ON u."userId" = urb."userId"
           WHERE urb."role" = 'admin'
             AND urb."userId" <> ?
             AND u."isActive" = 1`,
          id
        );
        if (Number(remaining[0]?.cnt ?? 0) <= 0) {
          throw new BadRequestException('不能移除最后一个有效 admin 角色绑定');
        }
      }

      // Delete existing bindings
      await tx.$executeRawUnsafe(`DELETE FROM "UserRoleBinding" WHERE "userId" = ?`, id);

      // Insert new bindings (multi-row — residual #95).
      const now = toSqliteDateTime();
      await this.insertRoleBindings(tx, id, dto.roles ?? [], now);
      await syncIamProjection(tx, id, dto.roles ?? []);

      // Bump session epoch so demotion/privilege changes hard-kill live JWTs
      // across instances (status cache alone is soft + TTL-bound).
      // Residual #169: changed-rows only — no free-form payload.
      const changed = Number(
        await tx.$executeRawUnsafe(
          `UPDATE "AppUser"
           SET "tokenVersion" = COALESCE("tokenVersion", 0) + 1, "updatedAt" = ?
           WHERE "userId" = ?`,
          now,
          id
        )
      );
      if (!changed) {
        throw new NotFoundException(`用户 ${id} 不存在`);
      }
    });

    return { success: true as const, userId: id };
  }

  // ─── Private helpers ─────────────────────────────────────────────

  /**
   * Multi-row INSERT for UserRoleBinding (residual #95).
   * Create/updateRoles used to N× single-row INSERT under $transaction.
   * Residual #134: returns synthesized bindings so create can skip post-write findById.
   */
  private async insertRoleBindings(
    tx: { $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown> },
    userId: string,
    roles: Array<{ role: string; scopeType?: string | null; scopeId?: string | null }>,
    now: string
  ): Promise<UserRoleBinding[]> {
    if (!roles.length) return [];
    // Admin role lists are small (typically ≤10); one statement is enough.
    const valueClauses = roles.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const params: unknown[] = [];
    const bindings: UserRoleBinding[] = [];
    for (const r of roles) {
      const id = this.generateId();
      const scopeType = r.scopeType ?? null;
      const scopeId = r.scopeId ?? null;
      params.push(id, userId, r.role, scopeType, scopeId, now);
      bindings.push({
        id,
        userId,
        role: r.role as UserRoleBinding['role'],
        scopeType: (scopeType as 'area' | 'merchant' | null) ?? undefined,
        scopeId: scopeId ?? undefined
      });
    }
    await tx.$executeRawUnsafe(
      `INSERT INTO "UserRoleBinding" ("id", "userId", "role", "scopeType", "scopeId", "createdAt")
       VALUES ${valueClauses}`,
      ...params
    );
    return bindings;
  }

  private async fetchRoleBindings(userId: string): Promise<UserRoleBinding[]> {
    const rows = await this.prisma.$queryRawUnsafe<RoleBindingRow[]>(
      `SELECT "id", "userId", "role", "scopeType", "scopeId", "createdAt" FROM "UserRoleBinding" WHERE "userId" = ? ORDER BY "createdAt" ASC`,
      userId
    );
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      role: r.role as UserRoleBinding['role'],
      scopeType: r.scopeType as 'area' | 'merchant' | undefined,
      scopeId: r.scopeId ?? undefined
    }));
  }

  private mapUser(row: UserPublicRow, bindings: UserRoleBinding[]): AppUser {
    const mapped: AppUser = {
      userId: row.userId,
      username: row.username,
      displayName: row.displayName,
      // Never return raw contact PII on list/detail — keep last-4 / local-head for ops.
      email: maskEmail(row.email),
      phone: maskPhone(row.phone),
      isActive: row.isActive === 1,
      lastLoginAt: row.lastLoginAt ?? undefined,
      roles: bindings,
      createdAt: row.createdAt
    };
    // Only attach session epoch when SELECT included it (auth paths). List omits it.
    if (row.tokenVersion !== undefined && row.tokenVersion !== null) {
      mapped.tokenVersion = Number(row.tokenVersion);
    } else if (row.tokenVersion === null) {
      mapped.tokenVersion = 0;
    }
    return mapped;
  }

  /**
   * Ensure the env-admin credentials exist as a real AppUser row (userId=admin).
   * Called on module init so login no longer needs the hardcoded password path
   * once the row is present. Idempotent — does not overwrite existing password.
   */
  async ensureEnvAdmin(username: string, password: string): Promise<void> {
    try {
      const byId = await this.prisma.$queryRawUnsafe<Array<{ userId: string }>>(
        `SELECT "userId" FROM "AppUser" WHERE "userId" = ?`,
        'admin'
      );
      if (byId.length > 0) return;

      const byName = await this.prisma.$queryRawUnsafe<Array<{ userId: string }>>(
        `SELECT "userId" FROM "AppUser" WHERE "username" = ?`,
        username
      );
      if (byName.length > 0) return;

      const passwordHash = await hashPassword(password);
      const now = toSqliteDateTime();
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "AppUser" ("userId", "username", "passwordHash", "displayName", "email", "phone", "isActive", "tokenVersion", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, NULL, NULL, 1, 0, ?, ?)`,
        'admin',
        username,
        passwordHash,
        username,
        now,
        now
      );
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "UserRoleBinding" ("id", "userId", "role", "scopeType", "scopeId", "createdAt")
         VALUES (?, ?, ?, NULL, NULL, ?)`,
        this.generateId(),
        'admin',
        'admin',
        now
      );
      await syncIamProjection(this.prisma, 'admin', [{ role: 'admin' }]);
      this.logger.log(`Seeded env-admin AppUser row for username=${username}`);
    } catch (err) {
      this.logger.warn(
        `ensureEnvAdmin skipped: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private generateId(): string {
    return newEntityId('usr');
  }
}
