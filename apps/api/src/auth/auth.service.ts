import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'node:crypto';
import { ADMIN_PASSWORD, ADMIN_USERNAME } from '../config/auth.config';
import { UserService } from '../user-access/user.service';

/** Constant-time string equality for env-admin password (avoids short-circuit leaks). */
function safeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Still run a compare so length mismatch is not a pure early-return side channel
    // against the longer buffer — use a fixed dummy of equal length to `ab`.
    const dummy = Buffer.alloc(ab.length);
    timingSafeEqual(ab, dummy);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(UserService) private readonly userService: UserService
  ) {}

  async login(username: string, password: string) {
    // Prefer AppUser (incl. ensureEnvAdmin-seeded admin row).
    const user = await this.userService.validateUser(username, password);
    if (user) {
      return this.signUserToken(user);
    }

    // Legacy env fallback is disabled once any AppUser exists (even non-admin).
    // Keep only as cold-start bootstrap when the user table is empty and env
    // credentials match — production must set AUTH_PASSWORD away from default.
    // Residual #144: hasAnyUsers alone covers username-match / userId=admin /
    // any-operator gates (empty table ⇒ all three former probes were null).
    if (username === ADMIN_USERNAME && safeEqualString(password, ADMIN_PASSWORD)) {
      const hasUsers = await this.userService.hasAnyUsers().catch(() => true);
      if (hasUsers) {
        throw new UnauthorizedException('用户名或密码错误');
      }
      return this.signAdminToken(username);
    }

    throw new UnauthorizedException('用户名或密码错误');
  }

  async localSession() {
    // Residual #143/#144: status projection only — never load email/phone/displayName.
    // Prefer seeded AppUser(userId=admin) then username match.
    const byId = await this.userService.findAuthStatus('admin').catch(() => null);
    if (byId) {
      // Deactivated admin must not fall through to cold-start JWT.
      if (!byId.isActive) throw new UnauthorizedException('用户已停用或不存在');
      return this.signUserToken(byId);
    }
    const user = await this.userService.findAuthStatusByUsername(ADMIN_USERNAME).catch(() => null);
    if (user) {
      if (!user.isActive) throw new UnauthorizedException('用户已停用或不存在');
      return this.signUserToken(user);
    }
    // True cold-start only when the user table is empty. Any existing AppUser
    // (even non-admin) means env-admin bootstrap is over.
    const hasUsers = await this.userService.hasAnyUsers().catch(() => true);
    if (hasUsers) {
      throw new UnauthorizedException('用户已停用或不存在');
    }
    return this.signAdminToken(ADMIN_USERNAME);
  }

  async refresh(payload: { sub: string; username: string; roles?: string[]; tv?: number }) {
    // Residual #143: status projection only — refresh re-signs, never returns profile PII.
    // Re-validate user from DB to catch deactivated / down-rolled / password-reset users
    const user = await this.userService.findAuthStatus(payload.sub).catch(() => null);
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
    // Hardcoded admin JWT (sub=admin) has no AppUser row until seeded —
    // keep refresh working ONLY while the table is still empty (true cold-start).
    if (payload.sub === 'admin' && payload.username === ADMIN_USERNAME) {
      const hasUsers = await this.userService.hasAnyUsers().catch(() => true);
      if (hasUsers) {
        throw new UnauthorizedException('用户已停用或不存在，刷新被拒绝');
      }
      return this.signAdminToken(payload.username);
    }
    throw new UnauthorizedException('用户已停用或不存在，刷新被拒绝');
  }

  private signUserToken(user: {
    userId: string;
    username: string;
    roles?: { role: string }[];
    tokenVersion?: number;
  }) {
    const roles = user.roles?.map((r) => r.role) ?? [];
    return {
      access_token: this.jwtService.sign({
        sub: user.userId,
        username: user.username,
        roles,
        tv: Number(user.tokenVersion ?? 0)
      }),
      username: user.username
    };
  }

  private signAdminToken(username: string) {
    return {
      // Cold-start env-admin has no AppUser row → tv=0; once seeded, DB path takes over.
      access_token: this.jwtService.sign({
        sub: 'admin',
        username,
        roles: ['admin'],
        tv: 0
      }),
      username
    };
  }
}
