import client from '../http-client';

export type IamRole = {
  roleId: string;
  code: string;
  name: string;
  description?: string | null;
  isSystemTemplate: number;
  isActive: number;
  permissions: Array<{ permissionId: string; permission: { code: string } }>;
};

export type IamPermission = {
  permissionId: string;
  code: string;
  name: string;
  description?: string | null;
  isSystem: number;
};

export type IamOrganizationUnit = {
  unitId: string;
  parentId: string | null;
  code: string;
  name: string;
  unitType: 'HEADQUARTERS' | 'REGION' | 'MERCHANT';
  areaId: string | null;
  merchantId: string | null;
  isActive: number;
};

export type IamUserAccess = {
  tenantId: string;
  primaryOrgUnitId: string | null;
  permissions: string[];
  roles: string[];
  memberships: Array<{
    membershipId: string;
    orgUnitId: string;
    isPrimary: boolean;
    orgUnit: IamOrganizationUnit;
  }>;
  roleAssignments: Array<{
    assignmentId: string;
    roleId: string;
    role: string;
    scopeType: 'ALL' | 'ORG_TREE' | 'ORG_ONLY' | 'NONE';
    orgUnitId: string | null;
    orgUnit: IamOrganizationUnit | null;
  }>;
};

export async function listIamRoles() {
  return client.get<IamRole[]>('/iam/roles').then((res) => res.data);
}

export async function listIamPermissions() {
  return client.get<IamPermission[]>('/iam/permissions').then((res) => res.data);
}

export async function listIamOrganizations() {
  return client.get<IamOrganizationUnit[]>('/iam/organizations').then((res) => res.data);
}

export async function createIamRole(data: {
  code: string;
  name: string;
  description?: string;
  permissionCodes: string[];
}) {
  return client.post<IamRole>('/iam/roles', data).then((res) => res.data);
}

export async function updateIamRole(
  id: string,
  data: { name?: string; description?: string; permissionCodes?: string[]; isActive?: boolean }
) {
  return client
    .patch<IamRole>(`/iam/roles/${encodeURIComponent(id)}`, data)
    .then((res) => res.data);
}

export async function createIamOrganization(data: {
  code: string;
  name: string;
  unitType: IamOrganizationUnit['unitType'];
  parentId?: string;
  areaId?: string;
  merchantId?: string;
}) {
  return client.post<IamOrganizationUnit>('/iam/organizations', data).then((res) => res.data);
}

export async function updateIamOrganization(
  id: string,
  data: {
    name?: string;
    parentId?: string;
    areaId?: string;
    merchantId?: string;
    isActive?: boolean;
  }
) {
  return client
    .patch<IamOrganizationUnit>(`/iam/organizations/${encodeURIComponent(id)}`, data)
    .then((res) => res.data);
}

export async function getIamUserAccess(id: string) {
  return client
    .get<IamUserAccess>(`/iam/users/${encodeURIComponent(id)}/access`)
    .then((res) => res.data);
}

export async function replaceIamUserAccess(
  id: string,
  data: {
    assignments: Array<{
      roleCode: string;
      scopeType: IamUserAccess['roleAssignments'][number]['scopeType'];
      orgUnitId?: string;
    }>;
    organizationUnitIds?: string[];
    primaryOrgUnitId?: string;
  }
) {
  return client
    .put<IamUserAccess>(`/iam/users/${encodeURIComponent(id)}/access`, data)
    .then((res) => res.data);
}
