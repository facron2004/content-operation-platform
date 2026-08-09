import { RoleScopeType } from '@prisma/client';

export type ResolvedIamAssignment = {
  roleId: string;
  roleCode: string;
  scopeType: RoleScopeType;
  orgUnitId: string | null;
  legacyOrgUnit: { areaId: string | null; merchantId: string | null } | null;
  permissionCodes: string[];
};
