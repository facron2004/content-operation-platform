import { Inject, Injectable } from '@nestjs/common';
import type { AppUser } from '@content/shared';
import { maskEmail, maskPhone } from '../../common/mask-pii';
import { clampListPage, clampListPageSize } from '../../common/sql-chunk';
import { likeContains } from '../../common/like-escape';
import { PrismaService } from '../../prisma/prisma.service';
import * as repo from '../repositories/user.repository';

@Injectable()
export class UserQueryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findById(userId: string, tenantId: string) {
    const row = await repo.findUserById(this.prisma, userId, tenantId);
    if (!row) return null;
    const bindings = await repo.fetchRoleBindings(this.prisma, row.userId);
    return mapUserFn(row, bindings);
  }

  async findAuthStatus(userId: string) {
    return this.loadAuthStatusByColumn('userId', userId);
  }

  async findAuthStatusByUsername(username: string) {
    return this.loadAuthStatusByColumn('username', username);
  }

  private async loadAuthStatusByColumn(column: 'userId' | 'username', value: string) {
    const row = await repo.findAuthByColumn(this.prisma, column, value);
    if (!row) return null;
    const bindings = await repo.findRolesByUserId(this.prisma, row.userId);
    return {
      userId: row.userId,
      username: row.username,
      isActive: Number(row.isActive) === 1,
      tokenVersion: Number(row.tokenVersion ?? 0),
      tenantId: await repo.findTenantId(this.prisma, row.userId),
      roles: bindings.map((b) => ({
        role: b.role,
        scopeType: b.scopeType ?? undefined,
        scopeId: b.scopeId ?? undefined
      }))
    };
  }

  async list(
    tenantId: string,
    page = 1,
    pageSize = 20,
    opts?: string | { keyword?: string; isActive?: number }
  ) {
    const safePage = clampListPage(page, 100);
    const safePageSize = clampListPageSize(pageSize, 100, 20);
    const offset = (safePage - 1) * safePageSize;
    const filters = typeof opts === 'string' ? { keyword: opts } : (opts ?? {});
    const conditions: string[] = [];
    const params: unknown[] = [];
    conditions.push('"tenantId" = ?');
    params.push(tenantId);
    const kw = typeof filters.keyword === 'string' ? filters.keyword.trim().slice(0, 100) : '';
    if (kw) {
      conditions.push(
        `("username" LIKE ? ESCAPE '\\' OR "displayName" LIKE ? ESCAPE '\\' OR "email" LIKE ? ESCAPE '\\' OR "userId" LIKE ? ESCAPE '\\')`
      );
      const pattern = likeContains(kw);
      params.push(pattern, pattern, pattern, pattern);
    }
    if (filters.isActive === 0 || filters.isActive === 1) {
      conditions.push('"isActive" = ?');
      params.push(filters.isActive);
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = await repo.countUsers(this.prisma, whereSql, params);
    const rows = await repo.listUsers(this.prisma, whereSql, params, safePageSize, offset);
    const userIds = rows.map((row) => row.userId);
    const allBindings = userIds.length ? await repo.batchRoleBindings(this.prisma, userIds) : [];
    const byUser = new Map<string, repo.RoleBindingRow[]>();
    for (const binding of allBindings) {
      if (!byUser.has(binding.userId)) byUser.set(binding.userId, []);
      byUser.get(binding.userId)!.push(binding);
    }
    const users = rows.map((row) => mapUserFn(row, byUser.get(row.userId) ?? []));
    return { data: users, total, page: safePage, pageSize: safePageSize };
  }

  async hasUnrestrictedPeerRole(userId: string, tenantId: string) {
    return repo.hasUnrestrictedPeerRole(this.prisma, userId, tenantId);
  }

  async hasAdminRole(userId: string, tenantId: string) {
    return repo.hasAdminRole(this.prisma, userId, tenantId);
  }
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
