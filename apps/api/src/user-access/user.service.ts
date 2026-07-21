import { Inject, Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import type { AppUser, UserRoleBinding } from '@content/shared';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateUserRolesDto } from './dto/update-user.dto';

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

interface UserRow {
  userId: string;
  username: string;
  passwordHash: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  isActive: number;
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
   * Fetch the full user row plus role bindings for a given username.
   * Used by AuthService on login.
   */
  async findByUsername(username: string): Promise<AppUser | null> {
    const rows = await this.prisma.$queryRawUnsafe<UserRow[]>(
      `SELECT * FROM "AppUser" WHERE "username" = ?`,
      username
    );
    const row = rows[0];
    if (!row) return null;

    const bindings = await this.fetchRoleBindings(row.userId);
    return this.mapUser(row, bindings);
  }

  /**
   * Validate username/password and return the user with roles if valid.
   * Returns null if user not found, inactive, or password mismatched.
   */
  async validateUser(username: string, password: string): Promise<AppUser | null> {
    const rows = await this.prisma.$queryRawUnsafe<UserRow[]>(
      `SELECT * FROM "AppUser" WHERE "username" = ?`,
      username
    );
    const row = rows[0];
    if (!row) return null;
    if (row.isActive !== 1) return null;

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

    const bindings = await this.fetchRoleBindings(row.userId);

    // Update lastLoginAt
    await this.prisma
      .$executeRawUnsafe(
        `UPDATE "AppUser" SET "lastLoginAt" = datetime('now') WHERE "userId" = ?`,
        row.userId
      )
      .catch(() => {});

    return this.mapUser(row, bindings);
  }

  /**
   * Fetch the full user row plus role bindings for a given userId.
   */
  async findById(userId: string): Promise<AppUser | null> {
    const rows = await this.prisma.$queryRawUnsafe<UserRow[]>(
      `SELECT * FROM "AppUser" WHERE "userId" = ?`,
      userId
    );
    const row = rows[0];
    if (!row) return null;

    const bindings = await this.fetchRoleBindings(row.userId);
    return this.mapUser(row, bindings);
  }

  /** List users with pagination and role bindings. */
  async list(page = 1, pageSize = 20) {
    const offset = (page - 1) * pageSize;
    const countRows = await this.prisma.$queryRawUnsafe<[{ count: number }]>(
      'SELECT COUNT(*) as count FROM "AppUser"'
    );
    const total = Number(countRows[0]?.count ?? 0);

    const rows = await this.prisma.$queryRawUnsafe<UserRow[]>(
      `SELECT * FROM "AppUser" ORDER BY "createdAt" DESC LIMIT ? OFFSET ?`,
      pageSize,
      offset
    );

    // Batch fetch role bindings for all users (fix N+1)
    const userIds = rows.map((r) => r.userId);
    const allBindings =
      userIds.length > 0
        ? await this.prisma.$queryRawUnsafe<RoleBindingRow[]>(
            `SELECT * FROM "UserRoleBinding" WHERE "userId" IN (${userIds.map(() => '?').join(',')}) ORDER BY "createdAt" ASC`,
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

    return { data: users, total, page, pageSize };
  }

  /** Create a new user with optional role bindings. */
  async create(dto: CreateUserDto): Promise<AppUser> {
    // Check existing username
    const existing = await this.prisma.$queryRawUnsafe<UserRow[]>(
      `SELECT "userId" FROM "AppUser" WHERE "username" = ?`,
      dto.username
    );
    if (existing.length > 0) {
      throw new ConflictException(`用户名 ${dto.username} 已存在`);
    }

    const userId = this.generateId();
    const passwordHash = await hashPassword(dto.password);

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO "AppUser" ("userId", "username", "passwordHash", "displayName", "email", "phone", "isActive", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
        userId,
        dto.username,
        passwordHash,
        dto.displayName ?? dto.username,
        dto.email ?? null,
        dto.phone ?? null
      );

      // Create role bindings if provided
      if (dto.roles && dto.roles.length > 0) {
        for (const r of dto.roles) {
          const bindingId = this.generateId();
          await tx.$executeRawUnsafe(
            `INSERT INTO "UserRoleBinding" ("id", "userId", "role", "scopeType", "scopeId", "createdAt")
             VALUES (?, ?, ?, ?, ?, datetime('now'))`,
            bindingId,
            userId,
            r.role,
            r.scopeType ?? null,
            r.scopeId ?? null
          );
        }
      }
    });

    const created = await this.findById(userId);
    if (!created) throw new Error('Failed to load created user');
    return created;
  }

  /** Update user info (displayName, email, phone, password, isActive). */
  async update(id: string, dto: UpdateUserDto): Promise<AppUser> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException(`用户 ${id} 不存在`);

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
    }
    if (dto.isActive !== undefined) {
      sets.push(`"isActive" = ?`);
      params.push(dto.isActive ? 1 : 0);
    }

    if (sets.length > 0) {
      sets.push(`"updatedAt" = datetime('now')`);
      params.push(id);
      await this.prisma.$executeRawUnsafe(
        `UPDATE "AppUser" SET ${sets.join(', ')} WHERE "userId" = ?`,
        ...params
      );
    }

    const updated = await this.findById(id);
    if (!updated) throw new Error('Failed to load updated user');
    return updated;
  }

  /** Deactivate a user (isActive = false). */
  async deactivate(id: string): Promise<AppUser> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException(`用户 ${id} 不存在`);

    await this.prisma.$executeRawUnsafe(
      `UPDATE "AppUser" SET "isActive" = 0, "updatedAt" = datetime('now') WHERE "userId" = ?`,
      id
    );

    const updated = await this.findById(id);
    if (!updated) throw new Error('Failed to load deactivated user');
    return updated;
  }

  /** Update role bindings for a user (replaces all existing bindings). */
  async updateRoles(id: string, dto: UpdateUserRolesDto): Promise<AppUser> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException(`用户 ${id} 不存在`);

    await this.prisma.$transaction(async (tx) => {
      // Delete existing bindings
      await tx.$executeRawUnsafe(`DELETE FROM "UserRoleBinding" WHERE "userId" = ?`, id);

      // Insert new bindings
      for (const r of dto.roles) {
        const bindingId = this.generateId();
        await tx.$executeRawUnsafe(
          `INSERT INTO "UserRoleBinding" ("id", "userId", "role", "scopeType", "scopeId", "createdAt")
           VALUES (?, ?, ?, ?, ?, datetime('now'))`,
          bindingId,
          id,
          r.role,
          r.scopeType ?? null,
          r.scopeId ?? null
        );
      }
    });

    const updated = await this.findById(id);
    if (!updated) throw new Error('Failed to load user after role update');
    return updated;
  }

  // ─── Private helpers ─────────────────────────────────────────────

  private async fetchRoleBindings(userId: string): Promise<UserRoleBinding[]> {
    const rows = await this.prisma.$queryRawUnsafe<RoleBindingRow[]>(
      `SELECT * FROM "UserRoleBinding" WHERE "userId" = ? ORDER BY "createdAt" ASC`,
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

  private mapUser(row: UserRow, bindings: UserRoleBinding[]): AppUser {
    return {
      userId: row.userId,
      username: row.username,
      displayName: row.displayName,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
      isActive: row.isActive === 1,
      lastLoginAt: row.lastLoginAt ?? undefined,
      roles: bindings,
      createdAt: row.createdAt
    };
  }

  private generateId(): string {
    return Date.now().toString(36) + '-' + randomBytes(8).toString('hex');
  }
}
