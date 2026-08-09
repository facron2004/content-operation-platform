import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { expandIamPermissionCodes } from './iam.catalog';
import {
  listIamOrganizationUnits,
  listIamPermissions,
  listIamRoles,
  loadIamUserAccess,
  loadPersistedIamLegacyBindings
} from './iam-access-queries';
import { projectIamLegacyBindings } from './iam-legacy-projection';
import type { AccessCacheEntry, IamLegacyScopeBinding, IamUserAccess } from './iam-access-types';

export type { IamLegacyScopeBinding, IamUserAccess } from './iam-access-types';

const ACCESS_TTL_MS = 5_000;
const ACCESS_CACHE_MAX = 1_000;

@Injectable()
export class IamAccessService {
  private readonly logger = new Logger(IamAccessService.name);
  private readonly cache = new Map<string, AccessCacheEntry>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getUserAccess(
    userId: string,
    tenantId: string,
    includeInactive = false
  ): Promise<IamUserAccess | null> {
    const normalizedTenantId = tenantId.trim();
    if (!normalizedTenantId) return null;
    const cacheKey = `${normalizedTenantId}:${userId}:${includeInactive ? 'all' : 'active'}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    try {
      const value = await loadIamUserAccess(
        this.prisma,
        userId,
        normalizedTenantId,
        includeInactive
      );
      if (!value) return null;
      this.cache.set(cacheKey, { expiresAt: Date.now() + ACCESS_TTL_MS, value });
      this.trimCache();
      return value;
    } catch (error) {
      // A rolling deployment may start before migration 0007 is applied. Keep
      // legacy routes available while clearly surfacing the IAM read failure.
      if (this.isMissingIamTable(error)) return null;
      this.logger.warn(`IAM access load failed for ${userId}: ${String(error)}`);
      throw error;
    }
  }

  async hasPermission(userId: string, permission: string, tenantId: string): Promise<boolean> {
    const access = await this.getUserAccess(userId, tenantId);
    const required = expandIamPermissionCodes([permission]);
    return Boolean(access && required.every((code) => access.permissions.includes(code)));
  }

  /** Project current IAM assignments into the compatibility area/merchant shape. */
  async getLegacyBindings(
    userId: string,
    tenantId: string
  ): Promise<IamLegacyScopeBinding[] | null> {
    const access = await this.getUserAccess(userId, tenantId);
    return access ? projectIamLegacyBindings(access) : null;
  }

  /** Read persisted compatibility rows for shadow comparison. */
  async getPersistedLegacyBindings(
    userId: string,
    tenantId: string
  ): Promise<IamLegacyScopeBinding[] | null> {
    return loadPersistedIamLegacyBindings(this.prisma, userId, tenantId);
  }

  invalidateUser(userId: string, tenantId?: string): void {
    const userKey = `:${userId}:`;
    for (const key of this.cache.keys()) {
      if (key.includes(userKey) && (!tenantId || key.startsWith(`${tenantId}:`))) {
        this.cache.delete(key);
      }
    }
  }

  /** Clear tenant-scoped and wildcard lookups after organization mutations. */
  invalidateTenant(tenantId: string): void {
    if (!tenantId) return;
    for (const [key, entry] of this.cache) {
      if (key.startsWith(`${tenantId}:`) || entry.value.tenantId === tenantId) {
        this.cache.delete(key);
      }
    }
  }

  listPermissions() {
    return listIamPermissions(this.prisma);
  }

  listRoles(tenantId: string) {
    return listIamRoles(this.prisma, tenantId);
  }

  listOrganizationUnits(tenantId: string) {
    return listIamOrganizationUnits(this.prisma, tenantId);
  }

  async listOrganizationTree(tenantId: string) {
    const rows = await this.listOrganizationUnits(tenantId);
    const nodes = rows.map((row) => ({ ...row, children: [] as unknown[] }));
    const byId = new Map(nodes.map((node) => [node.unitId, node]));
    const roots = [] as typeof nodes;
    for (const node of nodes) {
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  private trimCache() {
    if (this.cache.size <= ACCESS_CACHE_MAX) return;
    const now = Date.now();
    for (const [key, value] of this.cache) {
      if (value.expiresAt <= now) this.cache.delete(key);
    }
    while (this.cache.size > ACCESS_CACHE_MAX) {
      const oldest = this.cache.keys().next().value;
      if (!oldest) break;
      this.cache.delete(oldest);
    }
  }

  private isMissingIamTable(error: unknown): boolean {
    const message = String(error instanceof Error ? error.message : error);
    return /no such (table|column)|P2021|P2022|does not exist/i.test(message);
  }
}
