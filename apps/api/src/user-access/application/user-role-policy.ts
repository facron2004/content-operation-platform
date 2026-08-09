import { BadRequestException } from '@nestjs/common';
import { USER_ROLES } from '@content/shared';
import * as repo from '../repositories/user.repository';

const ROLE_SET = new Set<string>(USER_ROLES);
const SCOPE_TYPES = new Set(['area', 'merchant']);
const UNRESTRICTED_GRANT_ROLES = new Set(['admin', 'platform_operator', 'auditor']);
const SCOPED_ROLES = new Set(['area_operator', 'merchant_operator']);

export type RoleBindingInput = {
  role: string;
  scopeType?: string | null;
  scopeId?: string | null;
};

export type UserCommandOptions = {
  allowAdminRole?: boolean;
  allowUnrestrictedRoles?: boolean;
  tenantId?: string;
};

export function assertValidRoleBindings(
  roles: RoleBindingInput[] | undefined,
  opts?: Pick<UserCommandOptions, 'allowAdminRole' | 'allowUnrestrictedRoles'>
): void {
  if (!roles?.length) return;
  const allowUnrestrictedRoles = Boolean(opts?.allowUnrestrictedRoles ?? opts?.allowAdminRole);
  for (const roleBinding of roles) {
    if (!ROLE_SET.has(roleBinding.role)) {
      throw new BadRequestException(`无效角色: ${roleBinding.role}`);
    }
    if (UNRESTRICTED_GRANT_ROLES.has(roleBinding.role) && !allowUnrestrictedRoles) {
      throw new BadRequestException(`仅 admin 可授予无数据范围限制角色: ${roleBinding.role}`);
    }
    if (roleBinding.scopeType != null && !SCOPE_TYPES.has(roleBinding.scopeType)) {
      throw new BadRequestException(`无效 scopeType: ${roleBinding.scopeType}`);
    }
    if (SCOPED_ROLES.has(roleBinding.role)) {
      const expectedScopeType = roleBinding.role === 'area_operator' ? 'area' : 'merchant';
      if (roleBinding.scopeType !== expectedScopeType || !roleBinding.scopeId?.trim()) {
        throw new BadRequestException(
          `${roleBinding.role} 必须提供 scopeType=${expectedScopeType} 与 scopeId`
        );
      }
    }
  }
}

export async function assertScopeIdsExist(
  prisma: repo.Tx,
  roles: RoleBindingInput[] | undefined
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
