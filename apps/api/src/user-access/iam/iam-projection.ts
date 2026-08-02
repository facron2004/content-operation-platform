import { newEntityId } from '../../common/id';

type LegacyRoleBinding = {
  role: string;
  scopeType?: string | null;
  scopeId?: string | null;
};

export type IamRoleAssignmentProjection = {
  roleCode: string;
  scopeType: string;
  orgUnit?: {
    areaId: string | null;
    merchantId: string | null;
  } | null;
};

type IamProjectionClient = {
  appUser?: {
    update?: (args: unknown) => Promise<unknown>;
  };
  role?: {
    findUnique?: (args: unknown) => Promise<{ roleId: string } | null>;
  };
  organizationUnit?: {
    findUnique?: (args: unknown) => Promise<{ unitId: string } | null>;
  };
  userOrganizationMembership?: {
    deleteMany?: (args: unknown) => Promise<unknown>;
    upsert?: (args: unknown) => Promise<unknown>;
  };
  userRoleAssignment?: {
    deleteMany?: (args: unknown) => Promise<unknown>;
    create?: (args: unknown) => Promise<unknown>;
  };
  userRoleBinding?: {
    deleteMany?: (args: unknown) => Promise<unknown>;
    create?: (args: unknown) => Promise<unknown>;
  };
};

const DEFAULT_TENANT_ID = 'tenant_default';
const HQ_UNIT_ID = 'org_hq';
const UNRESTRICTED_ROLES = new Set(['admin', 'platform_operator', 'auditor']);

/**
 * Project one legacy role-binding write into the V0.11 IAM tables.
 *
 * The legacy service still owns the transaction during the compatibility
 * release. This helper deliberately accepts an unknown client so old unit
 * fakes and pre-0007 rolling instances can no-op without coupling the legacy
 * path to the new Prisma models.
 */
export async function syncIamProjection(
  client: unknown,
  userId: string,
  bindings: LegacyRoleBinding[],
  tenantId = DEFAULT_TENANT_ID
): Promise<void> {
  const prisma = client as IamProjectionClient;
  const hasModels =
    typeof prisma.appUser?.update === 'function' &&
    typeof prisma.role?.findUnique === 'function' &&
    typeof prisma.organizationUnit?.findUnique === 'function' &&
    typeof prisma.userOrganizationMembership?.upsert === 'function' &&
    typeof prisma.userRoleAssignment?.deleteMany === 'function' &&
    typeof prisma.userRoleAssignment?.create === 'function';
  if (!hasModels) return;

  try {
    const assignmentRows: Array<{
      roleId: string;
      scopeType: 'ALL' | 'ORG_TREE' | 'ORG_ONLY' | 'NONE';
      orgUnitId: string | null;
    }> = [];
    const membershipUnitIds = new Set<string>([HQ_UNIT_ID]);

    for (const binding of bindings) {
      const role = await prisma.role!.findUnique!({
        where: { tenantId_code: { tenantId, code: binding.role } },
        select: { roleId: true }
      });
      if (!role) throw new Error(`IAM role seed missing: ${tenantId}/${binding.role}`);

      let scopeType: 'ALL' | 'ORG_TREE' | 'ORG_ONLY' | 'NONE' = 'NONE';
      let orgUnitId: string | null = null;
      if (binding.scopeType && binding.scopeId) {
        scopeType = binding.scopeType === 'area' ? 'ORG_TREE' : 'ORG_ONLY';
        orgUnitId =
          binding.scopeType === 'area'
            ? `org_region_${binding.scopeId}`
            : `org_merchant_${binding.scopeId}`;
        const unit = await prisma.organizationUnit!.findUnique!({
          where: { unitId: orgUnitId },
          select: { unitId: true }
        });
        if (!unit) {
          throw new Error(`IAM organization seed missing: ${orgUnitId}`);
        }
        membershipUnitIds.add(unit.unitId);
      } else if (UNRESTRICTED_ROLES.has(binding.role)) {
        scopeType = 'ALL';
      }

      assignmentRows.push({ roleId: role.roleId, scopeType, orgUnitId });
    }

    await prisma.userRoleAssignment!.deleteMany!({ where: { tenantId, userId } });
    for (const row of assignmentRows) {
      await prisma.userRoleAssignment!.create!({
        data: {
          assignmentId: newEntityId('ura'),
          tenantId,
          userId,
          roleId: row.roleId,
          scopeType: row.scopeType,
          orgUnitId: row.orgUnitId,
          isActive: 1,
          createdBy: 'legacy-dual-write'
        }
      });
    }

    const hq = await prisma.organizationUnit!.findUnique!({
      where: { unitId: HQ_UNIT_ID },
      select: { unitId: true }
    });
    if (hq) membershipUnitIds.add(hq.unitId);

    if (typeof prisma.userOrganizationMembership!.deleteMany === 'function') {
      await prisma.userOrganizationMembership!.deleteMany({
        where: {
          tenantId,
          userId,
          orgUnitId: { notIn: [...membershipUnitIds] }
        }
      });
    }

    for (const orgUnitId of membershipUnitIds) {
      await prisma.userOrganizationMembership!.upsert!({
        where: { tenantId_userId_orgUnitId: { tenantId, userId, orgUnitId } },
        create: {
          membershipId: newEntityId('uom'),
          tenantId,
          userId,
          orgUnitId,
          isPrimary: orgUnitId === HQ_UNIT_ID ? 1 : 0,
          isActive: 1,
          createdBy: 'legacy-dual-write'
        },
        update: { isPrimary: orgUnitId === HQ_UNIT_ID ? 1 : 0, isActive: 1 }
      });
    }

    await prisma.appUser!.update!({
      where: { userId },
      data: { tenantId, primaryOrgUnitId: hq?.unitId ?? [...membershipUnitIds][0] ?? null }
    });
  } catch (error) {
    if (isMissingIamSchema(error)) return;
    throw error;
  }
}

/**
 * Project an IAM authorization replacement back to the legacy binding table.
 *
 * The legacy table can only express area/merchant scopes. ALL and NONE are
 * retained with null scope fields; custom organization nodes remain enforced
 * by the IAM guard while legacy data-scope consumers continue to see the
 * closest representable projection.
 */
export async function syncLegacyProjection(
  client: unknown,
  userId: string,
  assignments: IamRoleAssignmentProjection[]
): Promise<void> {
  const tx = client as IamProjectionClient;
  if (
    typeof tx.userRoleBinding?.deleteMany !== 'function' ||
    typeof tx.userRoleBinding?.create !== 'function'
  ) {
    return;
  }

  const rows = assignments.map((assignment) => {
    const isOrgScoped = assignment.scopeType === 'ORG_ONLY' || assignment.scopeType === 'ORG_TREE';
    const scopeType = isOrgScoped
      ? assignment.orgUnit?.merchantId
        ? 'merchant'
        : assignment.orgUnit?.areaId
          ? 'area'
          : null
      : null;
    const scopeId =
      scopeType === 'merchant'
        ? (assignment.orgUnit?.merchantId ?? null)
        : scopeType === 'area'
          ? (assignment.orgUnit?.areaId ?? null)
          : null;
    return { role: assignment.roleCode, scopeType, scopeId };
  });

  await tx.userRoleBinding.deleteMany({ where: { userId } });
  for (const row of rows) {
    await tx.userRoleBinding.create({
      data: {
        id: newEntityId('urb'),
        userId,
        role: row.role,
        scopeType: row.scopeType,
        scopeId: row.scopeId
      }
    });
  }
}

function isMissingIamSchema(error: unknown): boolean {
  const message = String(error instanceof Error ? error.message : error);
  return /no such (table|column)|P2021|P2022|does not exist/i.test(message);
}
