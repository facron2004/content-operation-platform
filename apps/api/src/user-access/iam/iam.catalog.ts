export const IAM_PERMISSION_CODES = [
  'content:read',
  'content:write',
  'content:export',
  'content:publish',
  'content:refresh',
  'packages:read',
  'packages:write',
  'packages:export',
  'packages:refresh',
  'campaigns:read',
  'campaigns:write',
  'campaigns:export',
  'campaigns:publish',
  'community:read',
  'community:write',
  'community:export',
  'tasks:read',
  'tasks:write',
  'tasks:manage',
  'tasks:export',
  'tasks:publish',
  'tasks:execute',
  'merchant:read',
  'merchant:manage',
  'analytics:read',
  'analytics:export',
  'analytics:refresh',
  'attribution:read',
  'attribution:manage',
  'jobs:read',
  'jobs:manage',
  'system:read',
  'system:manage',
  'users:read',
  'users:write',
  'users:roles',
  'iam:user:read',
  'iam:user:create',
  'iam:user:update',
  'iam:user:disable',
  'iam:access:assign',
  'iam:role:read',
  'iam:role:manage',
  'iam:org:manage',
  'iam:root',
  'iam:permissions:read',
  'iam:roles:read',
  'iam:roles:write',
  'iam:org:read',
  'iam:org:write',
  'iam:users:access',
  'audit:read',
  'audit:export'
] as const;

export type IamPermissionCode = (typeof IAM_PERMISSION_CODES)[number];

/**
 * Permission codes retained by the one-version compatibility window.
 *
 * These codes still exist in older databases, but new routes use the more
 * precise IAM names. Expanding aliases at the authorization boundary keeps
 * old role rows effective without exposing alias semantics to new callers.
 */
export const IAM_PERMISSION_ALIASES = {
  'users:read': ['iam:user:read'],
  'users:write': ['iam:user:create', 'iam:user:disable'],
  'users:roles': ['iam:users:access'],
  'iam:access:assign': ['iam:users:access'],
  'iam:role:read': ['iam:roles:read'],
  'iam:role:manage': ['iam:roles:write'],
  'iam:org:manage': ['iam:org:write']
} as const satisfies Record<string, readonly IamPermissionCode[]>;

/** Expand legacy permission codes into the canonical permissions they grant. */
export function expandIamPermissionCodes(codes: readonly string[]): string[] {
  const expanded = new Set<string>();
  for (const rawCode of codes) {
    const code = rawCode.trim();
    if (!code) continue;
    const targets = IAM_PERMISSION_ALIASES[code as keyof typeof IAM_PERMISSION_ALIASES] ?? [code];
    for (const target of targets) expanded.add(target);
  }
  return [...expanded];
}

export const SYSTEM_ROLE_CODES = [
  'platform_operator',
  'area_operator',
  'merchant_operator',
  'auditor',
  'executor',
  'admin'
] as const;

export type SystemRoleCode = (typeof SYSTEM_ROLE_CODES)[number];
