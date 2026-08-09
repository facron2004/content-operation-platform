import type { IamOrganizationUnit } from '../../services/api/iam.api';

export type TabKey = 'roles' | 'organizations' | 'users';

export type PermissionCenterUser = {
  userId: string;
  username: string;
  displayName?: string;
};

export type RoleForm = {
  code: string;
  name: string;
  description: string;
  permissionCodes: string[];
};

export type OrganizationForm = {
  code: string;
  name: string;
  unitType: IamOrganizationUnit['unitType'];
  parentId: string;
  areaId: string;
  merchantId: string;
};

export const USER_PICKER_PAGE_SIZE = 100;

export function createEmptyRoleForm(): RoleForm {
  return { code: '', name: '', description: '', permissionCodes: [] };
}

export function createEmptyOrganizationForm(): OrganizationForm {
  return {
    code: '',
    name: '',
    unitType: 'REGION',
    parentId: 'org_hq',
    areaId: '',
    merchantId: ''
  };
}
