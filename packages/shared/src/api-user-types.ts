/* V0.2.0 User & Audit domain types */
export interface AppUser {
  userId: string;
  username: string;
  displayName: string;
  email?: string;
  phone?: string;
  isActive: boolean;
  lastLoginAt?: string;
  roles: UserRoleBinding[];
  createdAt: string;
  /** V0.11 tenant context returned by /users/me when IAM is available. */
  tenantId?: string;
  primaryOrgUnitId?: string | null;
  permissions?: string[];
  memberships?: Array<Record<string, unknown>>;
  roleAssignments?: Array<Record<string, unknown>>;
  /** Server session epoch — bumped on password reset; not required by clients. */
  tokenVersion?: number;
}

export type UserRole =
  'platform_operator' | 'area_operator' | 'merchant_operator' | 'auditor' | 'executor' | 'admin';

export interface UserRoleBinding {
  id: string;
  userId: string;
  role: UserRole;
  scopeType?: 'area' | 'merchant';
  scopeId?: string;
}

export interface OperationAuditLogEntry {
  logId: string;
  userId?: string;
  username?: string;
  action: string;
  objectType: string;
  objectId?: string;
  before?: string;
  after?: string;
  result?: string;
  failReason?: string;
  ip?: string;
  createdAt: string;
}
