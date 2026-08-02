import { Inject, Injectable, Logger } from '@nestjs/common';
import { IamAccessService } from './iam-access.service';

type ShadowRequest = {
  path?: string;
  user?: {
    userId?: string;
    tenantId?: string;
    roles?: string[];
    bindings?: Array<{ role: string; scopeType?: string; scopeId?: string }>;
  };
};

const SHADOW_TTL_MS = 30_000;

/**
 * Compares the compatibility projection with the new IAM result without
 * changing the legacy route decision. Set IAM_SHADOW_MODE=false to disable
 * the comparison after the migration differences have reached zero.
 */
@Injectable()
export class IamShadowService {
  private readonly logger = new Logger(IamShadowService.name);
  private readonly enabled = process.env.IAM_SHADOW_MODE !== 'false';
  private readonly emitted = new Map<string, number>();

  constructor(@Inject(IamAccessService) private readonly accessService: IamAccessService) {}

  async inspect(request: ShadowRequest): Promise<void> {
    if (!this.enabled || !request.user?.userId) return;
    const user = request.user;
    const userId = user.userId;
    if (!userId) return;
    const access = await this.accessService.getUserAccess(userId, user.tenantId).catch(() => null);
    if (!access) return;

    const legacyRoles = [...new Set(user.roles ?? [])].sort();
    const iamRoles = [...new Set(access.roles)].sort();
    const legacyBindings = (user.bindings ?? [])
      .map((binding) => `${binding.role}:${binding.scopeType ?? ''}:${binding.scopeId ?? ''}`)
      .sort();
    const iamBindings = ((await this.accessService.getLegacyBindings(userId, user.tenantId)) ?? [])
      .map((binding) => `${binding.role}:${binding.scopeType ?? ''}:${binding.scopeId ?? ''}`)
      .sort();
    if (
      JSON.stringify(legacyRoles) === JSON.stringify(iamRoles) &&
      JSON.stringify(legacyBindings) === JSON.stringify(iamBindings)
    ) {
      return;
    }

    const mismatch = JSON.stringify({ legacyRoles, iamRoles, legacyBindings, iamBindings });
    const key = `${user.tenantId ?? access.tenantId}:${userId}:${request.path ?? ''}:${mismatch}`;
    const now = Date.now();
    if ((this.emitted.get(key) ?? 0) + SHADOW_TTL_MS > now) return;
    this.emitted.set(key, now);
    this.trimEmitted(now);
    this.logger.warn(
      `[IAM shadow] authorization projection differs at ${request.path ?? 'unknown route'} for ${userId}: ${mismatch}`
    );
  }

  private trimEmitted(now: number): void {
    if (this.emitted.size <= 1000) return;
    for (const [key, timestamp] of this.emitted) {
      if (timestamp + SHADOW_TTL_MS <= now) this.emitted.delete(key);
    }
  }
}
