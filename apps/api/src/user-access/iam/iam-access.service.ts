import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type AccessCacheEntry = {
  expiresAt: number;
  value: IamUserAccess;
};

export interface IamUserAccess {
  tenantId: string;
  primaryOrgUnitId: string | null;
  permissions: string[];
  memberships: Array<{
    membershipId: string;
    orgUnitId: string;
    isPrimary: boolean;
    orgUnit: {
      unitId: string;
      code: string;
      name: string;
      unitType: string;
      areaId: string | null;
      merchantId: string | null;
    };
  }>;
  roleAssignments: Array<{
    assignmentId: string;
    roleId: string;
    role: string;
    scopeType: string;
    orgUnitId: string | null;
    orgUnit: {
      unitId: string;
      code: string;
      name: string;
      unitType: string;
      areaId: string | null;
      merchantId: string | null;
    } | null;
  }>;
  roles: string[];
}

export type IamLegacyScopeBinding = {
  role: string;
  scopeType?: 'all' | 'area' | 'merchant';
  scopeId?: string;
};

const ACCESS_TTL_MS = 5_000;
const ACCESS_CACHE_MAX = 1_000;

@Injectable()
export class IamAccessService {
  private readonly logger = new Logger(IamAccessService.name);
  private readonly cache = new Map<string, AccessCacheEntry>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getUserAccess(userId: string, tenantId?: string): Promise<IamUserAccess | null> {
    const cacheKey = `${tenantId ?? '*'}:${userId}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    try {
      const user = await this.prisma.appUser.findUnique({
        where: { userId },
        select: { tenantId: true, primaryOrgUnitId: true, isActive: true }
      });
      if (!user || Number(user.isActive) !== 1 || (tenantId && user.tenantId !== tenantId)) {
        return null;
      }

      const [memberships, assignments] = await Promise.all([
        this.prisma.userOrganizationMembership.findMany({
          where: {
            tenantId: user.tenantId,
            userId,
            isActive: 1,
            deletedAt: null,
            orgUnit: { isActive: 1, deletedAt: null }
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          select: {
            membershipId: true,
            orgUnitId: true,
            isPrimary: true,
            orgUnit: {
              select: {
                unitId: true,
                code: true,
                name: true,
                unitType: true,
                areaId: true,
                merchantId: true
              }
            }
          }
        }),
        this.prisma.userRoleAssignment.findMany({
          where: {
            tenantId: user.tenantId,
            userId,
            isActive: 1,
            deletedAt: null,
            role: { isActive: 1, deletedAt: null }
          },
          orderBy: { createdAt: 'asc' },
          select: {
            assignmentId: true,
            roleId: true,
            scopeType: true,
            orgUnitId: true,
            role: {
              select: {
                code: true,
                permissions: {
                  where: { granted: 1, deletedAt: null, permission: { deletedAt: null } },
                  select: { permission: { select: { code: true } } }
                }
              }
            },
            orgUnit: {
              select: {
                unitId: true,
                code: true,
                name: true,
                unitType: true,
                areaId: true,
                merchantId: true
              }
            }
          }
        })
      ]);

      const permissionSet = new Set<string>();
      for (const assignment of assignments) {
        for (const row of assignment.role.permissions) permissionSet.add(row.permission.code);
      }

      const value: IamUserAccess = {
        tenantId: user.tenantId,
        primaryOrgUnitId: user.primaryOrgUnitId,
        permissions: [...permissionSet].sort(),
        memberships: memberships.map((membership) => ({
          membershipId: membership.membershipId,
          orgUnitId: membership.orgUnitId,
          isPrimary: Number(membership.isPrimary) === 1,
          orgUnit: membership.orgUnit
        })),
        roleAssignments: assignments.map((assignment) => ({
          assignmentId: assignment.assignmentId,
          roleId: assignment.roleId,
          role: assignment.role.code,
          scopeType: assignment.scopeType,
          orgUnitId: assignment.orgUnitId,
          orgUnit: assignment.orgUnit
        })),
        roles: [...new Set(assignments.map((assignment) => assignment.role.code))]
      };
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

  async hasPermission(userId: string, permission: string, tenantId?: string): Promise<boolean> {
    const access = await this.getUserAccess(userId, tenantId);
    return Boolean(access?.permissions.includes(permission));
  }

  /**
   * Project current IAM organization assignments into the compatibility
   * area/merchant shape consumed by existing business query code.
   * ORG_TREE expands through the current tenant tree; it never trusts a
   * client-provided scope id.
   */
  async getLegacyBindings(
    userId: string,
    tenantId?: string
  ): Promise<IamLegacyScopeBinding[] | null> {
    const access = await this.getUserAccess(userId, tenantId);
    if (!access) return null;

    const requiresTree = access.roleAssignments.some(
      (assignment) => assignment.scopeType === 'ORG_TREE'
    );
    const units = requiresTree ? await this.listOrganizationUnits(access.tenantId) : [];
    const byId = new Map(units.map((unit) => [unit.unitId, unit]));
    const children = new Map<string, typeof units>();
    for (const unit of units) {
      if (!unit.parentId) continue;
      const siblings = children.get(unit.parentId) ?? [];
      siblings.push(unit);
      children.set(unit.parentId, siblings);
    }

    const result: IamLegacyScopeBinding[] = [];
    const seen = new Set<string>();
    const add = (binding: IamLegacyScopeBinding) => {
      const key = `${binding.role}:${binding.scopeType ?? ''}:${binding.scopeId ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      result.push(binding);
    };

    for (const assignment of access.roleAssignments) {
      if (assignment.scopeType === 'ALL') {
        add({ role: assignment.role, scopeType: 'all' });
        continue;
      }
      if (assignment.scopeType === 'NONE' || !assignment.orgUnitId) continue;

      const scopedUnits =
        assignment.scopeType === 'ORG_TREE'
          ? this.collectTreeUnits(assignment.orgUnitId, byId, children)
          : [byId.get(assignment.orgUnitId) ?? assignment.orgUnit].filter(
              (unit): unit is NonNullable<typeof unit> => Boolean(unit)
            );
      for (const unit of scopedUnits) {
        if (unit.areaId) add({ role: assignment.role, scopeType: 'area', scopeId: unit.areaId });
        if (unit.merchantId)
          add({ role: assignment.role, scopeType: 'merchant', scopeId: unit.merchantId });
      }
    }
    return result;
  }

  invalidateUser(userId: string, tenantId?: string): void {
    if (tenantId) this.cache.delete(`${tenantId}:${userId}`);
    for (const key of this.cache.keys()) {
      if (key.endsWith(`:${userId}`)) this.cache.delete(key);
    }
  }

  async listPermissions() {
    return this.prisma.permission.findMany({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
      select: { permissionId: true, code: true, name: true, description: true, isSystem: true }
    });
  }

  async listRoles(tenantId = 'tenant_default') {
    return this.prisma.role.findMany({
      where: { tenantId, isActive: 1, deletedAt: null },
      orderBy: { code: 'asc' },
      select: {
        roleId: true,
        code: true,
        name: true,
        description: true,
        isSystemTemplate: true,
        isActive: true,
        permissions: {
          where: { granted: 1, deletedAt: null, permission: { deletedAt: null } },
          orderBy: { permissionId: 'asc' },
          select: { permissionId: true, permission: { select: { code: true } } }
        }
      }
    });
  }

  async listOrganizationUnits(tenantId = 'tenant_default') {
    return this.prisma.organizationUnit.findMany({
      where: { tenantId, isActive: 1, deletedAt: null },
      orderBy: [{ unitType: 'asc' }, { name: 'asc' }],
      select: {
        unitId: true,
        parentId: true,
        code: true,
        name: true,
        unitType: true,
        areaId: true,
        merchantId: true,
        isActive: true
      }
    });
  }

  async listOrganizationTree(tenantId = 'tenant_default') {
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

  private collectTreeUnits(
    rootId: string,
    byId: Map<string, Awaited<ReturnType<IamAccessService['listOrganizationUnits']>>[number]>,
    children: Map<string, Awaited<ReturnType<IamAccessService['listOrganizationUnits']>>>
  ) {
    const root = byId.get(rootId);
    if (!root) return [];
    const result = [root];
    const pending = [rootId];
    while (pending.length) {
      const parentId = pending.shift()!;
      for (const child of children.get(parentId) ?? []) {
        result.push(child);
        pending.push(child.unitId);
      }
    }
    return result;
  }

  private isMissingIamTable(error: unknown): boolean {
    const message = String(error instanceof Error ? error.message : error);
    return /no such (table|column)|P2021|P2022|does not exist/i.test(message);
  }
}
