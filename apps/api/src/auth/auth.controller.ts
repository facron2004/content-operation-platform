import { Body, Controller, Inject, Logger, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import { createDtoPipe } from '../common/dto-pipe';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { assertLocalSessionAllowed } from './auth-local-session';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
class LoginDto {
  @IsNotEmpty() @IsString() @MinLength(1) @MaxLength(64) username!: string;
  @IsNotEmpty() @IsString() @MinLength(1) @MaxLength(128) password!: string;
}
@ApiTags('auth')
@RequireLogin()
@Controller('api/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}
  @Public() @Throttle({ long: { limit: 5, ttl: 60000 } }) @Post('login') login(
    @Body(createDtoPipe(LoginDto)) body: LoginDto
  ) {
    // createDtoPipe enforces presence/length; trim is still applied for auth lookup.
    const username = body.username.trim();
    const password = body.password;
    if (!username || !password) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    return this.authService.login(username, password);
  }
  @Public()
  @Throttle({ long: { limit: 5, ttl: 60000 } })
  @Post('local-session')
  localSession(@Req() req: Request) {
    assertLocalSessionAllowed(req, this.logger);
    return this.authService.localSession();
  }
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Post('refresh')
  refresh(@Req() req: Request) {
    const u = req.user as
      | {
          sub?: string;
          userId?: string;
          username?: string;
          roles?: string[];
          tokenVersion?: number;
          tv?: number;
        }
      | undefined;
    const sub = u?.userId ?? u?.sub;
    const username = u?.username;
    if (!sub || !username) {
      throw new UnauthorizedException('无效的刷新令牌');
    }
    // JwtStrategy.validate attaches tokenVersion after asserting JWT tv === DB.
    // Without this, refresh always sees tv=undefined and rejects valid sessions.
    const tv =
      typeof u?.tokenVersion === 'number'
        ? u.tokenVersion
        : typeof u?.tv === 'number'
          ? u.tv
          : undefined;
    return this.authService.refresh({
      sub,
      username,
      roles: u?.roles,
      tv
    });
  }
}
