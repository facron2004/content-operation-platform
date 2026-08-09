import { UnauthorizedException } from '@nestjs/common';

export type TenantContext = {
  tenantId?: string | null;
};

/**
 * A tenant is part of the authenticated-session boundary. Callers handling a
 * request must not substitute a default tenant when the claim is absent.
 */
export function requireTenantId(user: TenantContext | undefined): string {
  const tenantId = typeof user?.tenantId === 'string' ? user.tenantId.trim() : '';
  if (!tenantId) throw new UnauthorizedException('会话缺少租户信息');
  return tenantId;
}
