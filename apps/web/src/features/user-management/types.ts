export type UserRoleBinding = {
  role: string;
  scopeType?: string;
  scopeId?: string;
};

export type UserRow = {
  userId: string;
  username: string;
  displayName?: string;
  email?: string;
  phone?: string;
  roles?: UserRoleBinding[];
  isActive?: boolean;
  lastLoginAt?: string;
};

export type RoleDraft = {
  role: string;
  scopeType?: 'area' | 'merchant';
  scopeId?: string;
};

export type UserFormPayload = {
  username: string;
  password: string;
  displayName?: string;
  email?: string;
  phone?: string;
  roles?: RoleDraft[];
};

export const roleLabels: Record<string, string> = {
  platform_operator: '平台运营',
  area_operator: '区域运营',
  merchant_operator: '商家运营',
  auditor: '审核人员',
  executor: '执行人员',
  admin: '管理员'
};

export const roleOptions = Object.entries(roleLabels).map(([value, label]) => ({ value, label }));

const SCOPED_ROLES = new Set(['area_operator', 'merchant_operator']);

export function needsScope(role: string): boolean {
  return SCOPED_ROLES.has(role);
}

export function expectedScopeType(role: string): 'area' | 'merchant' | undefined {
  if (role === 'area_operator') return 'area';
  if (role === 'merchant_operator') return 'merchant';
  return undefined;
}

export function formatRoleTag(binding: UserRoleBinding): string {
  const label = roleLabels[binding.role] || binding.role;
  return binding.scopeId ? `${label}(${binding.scopeId})` : label;
}
