export type AccessCacheEntry = {
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
