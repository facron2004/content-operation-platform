import { Inject, Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AppUser, UserRoleBinding } from '@content/shared';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateUserRolesDto } from './dto/update-user.dto';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256')
    .update(salt + password)
    .digest('hex');
  return salt + ':' + hash;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  return (
    createHash('sha256')
      .update(salt + password)
      .digest('hex') === hash
  );
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
    if (!verifyPassword(password, row.passwordHash)) return null;

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

    const users = await Promise.all(
      rows.map(async (row) => {
        const bindings = await this.fetchRoleBindings(row.userId);
        return this.mapUser(row, bindings);
      })
    );

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
    const passwordHash = hashPassword(dto.password);

    await this.prisma.$executeRawUnsafe(
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
        await this.prisma.$executeRawUnsafe(
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
      params.push(hashPassword(dto.password));
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

    // Delete existing bindings
    await this.prisma.$executeRawUnsafe(`DELETE FROM "UserRoleBinding" WHERE "userId" = ?`, id);

    // Insert new bindings
    for (const r of dto.roles) {
      const bindingId = this.generateId();
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "UserRoleBinding" ("id", "userId", "role", "scopeType", "scopeId", "createdAt")
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        bindingId,
        id,
        r.role,
        r.scopeType ?? null,
        r.scopeId ?? null
      );
    }

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
