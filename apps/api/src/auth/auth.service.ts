import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ADMIN_PASSWORD, ADMIN_USERNAME } from '../config/auth.config';
import { UserService } from '../user-access/user.service';

@Injectable()
export class AuthService {
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(UserService) private readonly userService: UserService
  ) {}

  async login(username: string, password: string) {
    // V0.2.0: query AppUser table for authentication
    const user = await this.userService.validateUser(username, password);
    if (user) {
      return this.signUserToken(user);
    }

    // Fallback: hardcoded admin credentials for backward compatibility
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      return this.signAdminToken(username);
    }

    throw new UnauthorizedException('用户名或密码错误');
  }

  async localSession() {
    // Try to find the admin user in AppUser table
    const user = await this.userService.findByUsername(ADMIN_USERNAME);
    if (user) {
      return this.signUserToken(user);
    }
    return this.signAdminToken(ADMIN_USERNAME);
  }

  refresh(payload: { sub: string; username: string; roles?: string[] }) {
    return {
      access_token: this.jwtService.sign({
        sub: payload.sub,
        username: payload.username,
        roles: payload.roles ?? []
      }),
      username: payload.username
    };
  }

  private signUserToken(user: { userId: string; username: string; roles?: { role: string }[] }) {
    const roles = user.roles?.map((r) => r.role) ?? [];
    return {
      access_token: this.jwtService.sign({
        sub: user.userId,
        username: user.username,
        roles
      }),
      username: user.username
    };
  }

  private signAdminToken(username: string) {
    return {
      access_token: this.jwtService.sign({ sub: 'admin', username, roles: ['admin'] }),
      username
    };
  }
}
