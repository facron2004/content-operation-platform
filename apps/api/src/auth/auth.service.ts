import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ADMIN_USERNAME, ADMIN_PASSWORD } from '../config/auth.config';

@Injectable()
export class AuthService {
  constructor(@Inject(JwtService) private readonly jwtService: JwtService) {}

  login(username: string, password: string) {
    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    const payload = { sub: 'admin', username };
    return {
      access_token: this.jwtService.sign(payload),
      username
    };
  }
}
