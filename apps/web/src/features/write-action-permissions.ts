const COMMAND_ROLES = new Set(['admin', 'platform_operator']);

function hasCommandRole(roles: readonly string[]): boolean {
  return roles.some((role) => COMMAND_ROLES.has(role));
}

export function canManageAttribution(
  roles: readonly string[],
  permissions: readonly string[]
): boolean {
  return hasCommandRole(roles) && permissions.includes('attribution:manage');
}

export function canWritePackages(
  roles: readonly string[],
  permissions: readonly string[]
): boolean {
  return hasCommandRole(roles) && permissions.includes('packages:write');
}

export function canManageOrders(roles: readonly string[], permissions: readonly string[]): boolean {
  return hasCommandRole(roles) && permissions.includes('orders:manage');
}

export function canManageMerchants(
  roles: readonly string[],
  permissions: readonly string[]
): boolean {
  return hasCommandRole(roles) && permissions.includes('merchant:manage');
}
