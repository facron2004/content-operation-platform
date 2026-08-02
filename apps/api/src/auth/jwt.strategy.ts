import { Inject, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JWT_SECRET } from '../config/auth.config';
import { UserService } from '../user-access/user.service';
import { IamAccessService } from '../user-access/iam/iam-access.service';

type JwtPayload = {
  sub: string;
  username: string;
  roles?: string[];
  tenantId?: string;
  tv?: number;
};

const STATUS_TTL_MS = 15_000;

type CachedBinding = {
  role: string;
  scopeType?: string;
  scopeId?: string;
};

type CachedStatus = {
  expiresAt: number;
  isActive: boolean;
  username: string;
  roles: string[];
  bindings: CachedBinding[];
  tokenVersion: number;
  tenantId: string;
  permissions: string[];
};

/**
 * JWT strategy that re-checks AppUser isActive + roles/bindings with a short TTL cache.
 * Env-admin (sub=admin) still works without AppUser, but prefers DB row when seeded.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly statusCache = new Map<string, CachedStatus>();

  constructor(
    @Inject(UserService) private readonly userService: UserService,
    @Optional() @Inject(IamAccessService) private readonly iamAccessService?: IamAccessService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: JWT_SECRET
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload?.sub || !payload?.username) {
      throw new UnauthorizedException('无效令牌');
    }

    // Prefer DB for env-admin when bootstrap seed created AppUser(userId=admin)
    if (payload.sub === 'admin') {
      const status = await this.resolveStatus(payload.sub);
      if (status) {
        // Deactivated admin must not keep working via the cold-start JWT fallback.
        if (!status.isActive) {
          throw new UnauthorizedException('用户已停用或不存在');
        }
        this.assertTokenVersion(payload.tv, status.tokenVersion);
        return {
          userId: payload.sub,
          username: status.username || payload.username,
          roles: status.roles.length ? status.roles : ['admin'],
          bindings: status.bindings,
          tenantId: status.tenantId,
          permissions: status.permissions,
          // Propagate session epoch so /auth/refresh can re-sign with the same tv.
          tokenVersion: status.tokenVersion
        };
      }
      // No AppUser(userId=admin). Cold-start env-admin JWT is only valid while
      // the user table is empty. Once any operator exists, refuse the fallback
      // so a leftover cold-start token cannot outrank real accounts.
      const hasUsers = await this.userService.hasAnyUsers().catch(() => true);
      if (hasUsers) {
        throw new UnauthorizedException('用户已停用或不存在');
      }
      return {
        userId: payload.sub,
        username: payload.username,
        roles: payload.roles?.length ? payload.roles : ['admin'],
        bindings: [] as CachedBinding[],
        tenantId: payload.tenantId ?? 'tenant_default',
        permissions: [],
        tokenVersion: typeof payload.tv === 'number' ? payload.tv : 0
      };
    }

    const status = await this.resolveStatus(payload.sub);
    if (!status || !status.isActive) {
      throw new UnauthorizedException('用户已停用或不存在');
    }
    this.assertTokenVersion(payload.tv, status.tokenVersion);

    return {
      userId: payload.sub,
      username: status.username || payload.username,
      // Prefer DB roles so deactivation/down-roll takes effect within TTL
      roles: status.roles,
      bindings: status.bindings,
      tenantId: status.tenantId,
      permissions: status.permissions,
      // Propagate session epoch so /auth/refresh can re-sign with the same tv.
      tokenVersion: status.tokenVersion
    };
  }

  /** Password reset bumps tokenVersion; pre-reset JWTs (or missing tv) are refused. */
  private assertTokenVersion(tokenTv: number | undefined, dbTv: number): void {
    if (tokenTv === undefined || Number(tokenTv) !== Number(dbTv)) {
      throw new UnauthorizedException('会话已失效，请重新登录');
    }
  }

  /** Drop cached status (call after deactivate / role change). */
  invalidateStatus(userId: string): void {
    this.statusCache.delete(userId);
  }

  private async resolveStatus(userId: string): Promise<CachedStatus | null> {
    const now = Date.now();
    const cached = this.statusCache.get(userId);
    if (cached && cached.expiresAt > now) return cached;

    // Residual #143: status projection only — no email/phone/displayName/binding ids.
    const user = await this.userService.findAuthStatus(userId).catch(() => null);
    if (!user) {
      this.statusCache.delete(userId);
      return null;
    }
    let roles = user.roles.map((r) => r.role);
    let bindings: CachedBinding[] = user.roles.map((r) => ({
      role: r.role,
      scopeType: r.scopeType,
      scopeId: r.scopeId
    }));
    let tenantId = user.tenantId ?? 'tenant_default';
    let permissions: string[] = [];
    const access = await this.iamAccessService?.getUserAccess(userId, tenantId).catch(() => null);
    if (access) {
      roles = access.roles;
      tenantId = access.tenantId;
      permissions = access.permissions;
      const projectedBindings = await this.iamAccessService
        ?.getLegacyBindings(userId, tenantId)
        .catch(() => null);
      if (projectedBindings) bindings = projectedBindings;
    }
    const entry: CachedStatus = {
      expiresAt: now + STATUS_TTL_MS,
      isActive: user.isActive,
      username: user.username,
      roles,
      bindings,
      tokenVersion: Number(user.tokenVersion ?? 0),
      tenantId,
      permissions
    };
    this.statusCache.set(userId, entry);
    // Bound cache size for long-running processes: drop expired first, then FIFO.
    if (this.statusCache.size > 500) {
      for (const [key, value] of this.statusCache) {
        if (value.expiresAt <= now) this.statusCache.delete(key);
      }
      while (this.statusCache.size > 500) {
        const oldest = this.statusCache.keys().next().value;
        if (!oldest) break;
        this.statusCache.delete(oldest);
      }
    }
    return entry;
  }
}
