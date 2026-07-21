import type { UserRoleBinding } from '@content/shared';

/**
 * Build Prisma-style data scope filter conditions based on user's role bindings.
 *
 * - admin / platform_operator: empty object (all data)
 * - area_operator: { areaId: user.scopeId }
 * - merchant_operator: { merchantId: user.scopeId }
 * - auditor: empty (can see all for review)
 */
export function buildDataScope(user: {
  roles?: string[];
  bindings?: UserRoleBinding[];
}): Record<string, unknown> {
  if (!user?.roles || user.roles.length === 0) return {};

  if (user.roles.includes('admin') || user.roles.includes('platform_operator')) {
    return {};
  }

  if (user.roles.includes('auditor')) {
    return {};
  }

  const binding = user.bindings?.[0];
  if (!binding) return {};

  if (user.roles.includes('area_operator') && binding.scopeType === 'area' && binding.scopeId) {
    return { areaId: binding.scopeId };
  }

  if (
    user.roles.includes('merchant_operator') &&
    binding.scopeType === 'merchant' &&
    binding.scopeId
  ) {
    return { merchantId: binding.scopeId };
  }

  return {};
}
