import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describeError } from '@content/shared';
import { ADMIN_USERNAME } from '../config/auth.config';
import {
  UserAuthService,
  UserQueryService
} from '../user-access/application/user-application.service';
import { requireTenantId } from '../user-access/tenant-context';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(UserAuthService) private readonly userAuthService: UserAuthService,
    @Inject(UserQueryService) private readonly userQueryService: UserQueryService
  ) {}

  async login(username: string, password: string) {
    // Prefer AppUser (incl. ensureEnvAdmin-seeded admin row).
    const user = await this.userAuthService.validateUser(username, password);
    if (user) {
      return this.signUserToken(user);
    }
    throw new UnauthorizedException('用户名或密码错误');
  }

  async localSession() {
    // Residual #143/#144: status projection only — never load email/phone/displayName.
    // Prefer seeded AppUser(userId=admin) then username match.
    const byId = await this.userQueryService.findAuthStatus('admin').catch((error: unknown) => {
      this.logger.warn(`local-session AppUser id lookup failed: ${describeError(error)}`);
      return null;
    });
    if (byId) {
      // Deactivated admin must not fall through to cold-start JWT.
      if (!byId.isActive) throw new UnauthorizedException('用户已停用或不存在');
      return this.signUserToken(byId);
    }
    const user = await this.userQueryService
      .findAuthStatusByUsername(ADMIN_USERNAME)
      .catch((error: unknown) => {
        this.logger.warn(`local-session AppUser username lookup failed: ${describeError(error)}`);
        return null;
      });
    if (user) {
      if (!user.isActive) throw new UnauthorizedException('用户已停用或不存在');
      return this.signUserToken(user);
    }
    throw new UnauthorizedException('用户已停用或不存在');
  }

  async refresh(payload: { sub: string; username: string; roles?: string[]; tv?: number }) {
    // Residual #143: status projection only — refresh re-signs, never returns profile PII.
    // Re-validate user from DB to catch deactivated / down-rolled / password-reset users
    const user = await this.userQueryService.findAuthStatus(payload.sub).catch((error: unknown) => {
      this.logger.warn(`refresh AppUser lookup failed for ${payload.sub}: ${describeError(error)}`);
      return null;
    });
    if (user) {
      if (!user.isActive) {
        throw new UnauthorizedException('用户已停用或不存在，刷新被拒绝');
      }
      const currentTv = Number(user.tokenVersion ?? 0);
      // Missing tv (pre-tokenVersion tokens) or mismatch → force re-login after password reset.
      if (payload.tv === undefined || Number(payload.tv) !== currentTv) {
        throw new UnauthorizedException('会话已失效，请重新登录');
      }
      return this.signUserToken(user);
    }
    throw new UnauthorizedException('用户已停用或不存在，刷新被拒绝');
  }

  private signUserToken(user: {
    userId: string;
    username: string;
    roles?: { role: string }[];
    tokenVersion?: number;
    tenantId?: string;
  }) {
    const roles = user.roles?.map((r) => r.role) ?? [];
    const tenantId = requireTenantId(user);
    return {
      access_token: this.jwtService.sign({
        sub: user.userId,
        username: user.username,
        roles,
        tenantId,
        tv: Number(user.tokenVersion ?? 0)
      }),
      username: user.username
    };
  }
}
