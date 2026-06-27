import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ADMIN_PASSWORD, ADMIN_USERNAME } from '../config/auth.config';

@Injectable()
export class AuthService {
  constructor(@Inject(JwtService) private readonly jwtService: JwtService) {}

  login(username: string, password: string) {
    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    return this.signAdminToken(username);
  }

  localSession() {
    return this.signAdminToken(ADMIN_USERNAME);
  }

  refresh(payload: { sub: string; username: string }) {
    return {
      access_token: this.jwtService.sign({ sub: payload.sub, username: payload.username }),
      username: payload.username
    };
  }

  private signAdminToken(username: string) {
    return {
      access_token: this.jwtService.sign({ sub: 'admin', username }),
      username
    };
  }
}
