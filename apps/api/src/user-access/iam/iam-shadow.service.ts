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

export type IamShadowPathStats = {
  comparisons: number;
  matches: number;
  mismatches: number;
  skipped: number;
};

export type IamShadowStats = IamShadowPathStats & {
  enabled: boolean;
  lastMismatchAt: string | null;
  byPath: Record<string, IamShadowPathStats>;
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
  private readonly stats: IamShadowPathStats = {
    comparisons: 0,
    matches: 0,
    mismatches: 0,
    skipped: 0
  };
  private readonly byPath = new Map<string, IamShadowPathStats>();
  private lastMismatchAt: string | null = null;

  constructor(@Inject(IamAccessService) private readonly accessService: IamAccessService) {}

  async inspect(request: ShadowRequest): Promise<void> {
    if (!this.enabled || !request.user?.userId) {
      this.stats.skipped++;
      return;
    }
    const user = request.user;
    const userId = user.userId;
    if (!userId || !user.tenantId?.trim()) {
      this.stats.skipped++;
      return;
    }
    const tenantId = user.tenantId.trim();
    const path = request.path ?? 'unknown';
    const pathStats = this.getPathStats(path);
    let access: Awaited<ReturnType<IamAccessService['getUserAccess']>>;
    try {
      access = await this.accessService.getUserAccess(userId, tenantId);
    } catch (error) {
      this.stats.skipped++;
      pathStats.skipped++;
      this.logger.warn(
        JSON.stringify({
          event: 'iam_shadow_skipped',
          path,
          userId,
          tenantId: user.tenantId,
          reason: String(error instanceof Error ? error.message : error)
        })
      );
      return;
    }
    if (!access) {
      this.stats.skipped++;
      pathStats.skipped++;
      return;
    }

    let projectedBindings: Awaited<ReturnType<IamAccessService['getLegacyBindings']>>;
    try {
      projectedBindings = await this.accessService.getLegacyBindings(userId, tenantId);
    } catch (error) {
      this.stats.skipped++;
      pathStats.skipped++;
      this.logger.warn(
        JSON.stringify({
          event: 'iam_shadow_skipped',
          path,
          userId,
          tenantId,
          reason: String(error instanceof Error ? error.message : error)
        })
      );
      return;
    }
    if (!projectedBindings) {
      this.stats.skipped++;
      pathStats.skipped++;
      return;
    }

    let persistedBindings: Awaited<ReturnType<IamAccessService['getPersistedLegacyBindings']>>;
    try {
      persistedBindings = await this.accessService.getPersistedLegacyBindings(userId, tenantId);
    } catch (error) {
      this.stats.skipped++;
      pathStats.skipped++;
      this.logger.warn(
        JSON.stringify({
          event: 'iam_shadow_skipped',
          path,
          userId,
          tenantId,
          reason: String(error instanceof Error ? error.message : error)
        })
      );
      return;
    }
    if (!persistedBindings) {
      this.stats.skipped++;
      pathStats.skipped++;
      return;
    }

    this.stats.comparisons++;
    pathStats.comparisons++;

    const legacyRoles = [...new Set(persistedBindings.map((binding) => binding.role))].sort();
    const iamRoles = [...new Set(access.roles)].sort();
    const legacyBindings = persistedBindings
      .map((binding) => `${binding.role}:${binding.scopeType ?? ''}:${binding.scopeId ?? ''}`)
      .sort();
    const iamBindings = projectedBindings
      .map((binding) => `${binding.role}:${binding.scopeType ?? ''}:${binding.scopeId ?? ''}`)
      .sort();
    if (
      JSON.stringify(legacyRoles) === JSON.stringify(iamRoles) &&
      JSON.stringify(legacyBindings) === JSON.stringify(iamBindings)
    ) {
      this.stats.matches++;
      pathStats.matches++;
      return;
    }

    this.stats.mismatches++;
    pathStats.mismatches++;
    this.lastMismatchAt = new Date().toISOString();
    const mismatch = JSON.stringify({ legacyRoles, iamRoles, legacyBindings, iamBindings });
    const key = `${tenantId}:${userId}:${path}:${mismatch}`;
    const now = Date.now();
    if ((this.emitted.get(key) ?? 0) + SHADOW_TTL_MS > now) return;
    this.emitted.set(key, now);
    this.trimEmitted(now);
    this.logger.warn(
      JSON.stringify({
        event: 'iam_shadow_mismatch',
        path,
        userId,
        tenantId,
        mismatch: JSON.parse(mismatch)
      })
    );
  }

  getStats(): IamShadowStats {
    const byPath = Object.fromEntries(
      [...this.byPath.entries()].map(([path, stats]) => [path, { ...stats }])
    );
    return { ...this.stats, enabled: this.enabled, lastMismatchAt: this.lastMismatchAt, byPath };
  }

  resetStats(): void {
    Object.assign(this.stats, { comparisons: 0, matches: 0, mismatches: 0, skipped: 0 });
    this.byPath.clear();
    this.lastMismatchAt = null;
  }

  private getPathStats(path: string): IamShadowPathStats {
    let stats = this.byPath.get(path);
    if (!stats) {
      stats = { comparisons: 0, matches: 0, mismatches: 0, skipped: 0 };
      this.byPath.set(path, stats);
    }
    return stats;
  }

  private trimEmitted(now: number): void {
    if (this.emitted.size <= 1000) return;
    for (const [key, timestamp] of this.emitted) {
      if (timestamp + SHADOW_TTL_MS <= now) this.emitted.delete(key);
    }
  }
}
