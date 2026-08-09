import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { createDtoPipe } from '../common/dto-pipe';
import { AuthService } from './auth.service';
import { clearAuthCookie, setAuthCookie } from './auth-cookie';
import { Public } from './public.decorator';
import { assertLocalSessionAllowed } from './auth-local-session';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
class LoginDto {
  @IsNotEmpty() @IsString() @MinLength(1) @MaxLength(64) username!: string;
  @IsNotEmpty() @IsString() @MinLength(1) @MaxLength(128) password!: string;
}

type AuthTokenResult = { access_token: string; username: string };
type BrowserAuthResult = { authenticated: true; username: string };
type RefreshPrincipal = {
  sub: string;
  username: string;
  roles?: string[];
  tv?: number;
};

@ApiTags('auth')
@RequireLogin()
@Controller('api/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  private withAuthCookie<T extends AuthTokenResult>(res: Response, result: T): T {
    setAuthCookie(res, result.access_token);
    return result;
  }

  private withBrowserAuthCookie(res: Response, result: AuthTokenResult): BrowserAuthResult {
    setAuthCookie(res, result.access_token);
    return { authenticated: true, username: result.username };
  }

  private loginCredentials(body: LoginDto): { username: string; password: string } {
    // createDtoPipe enforces presence/length; trim is still applied for auth lookup.
    const username = body.username.trim();
    const password = body.password;
    if (!username || !password) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    return { username, password };
  }

  private issueLocalSession(req: Request): Promise<AuthTokenResult> {
    assertLocalSessionAllowed(req, this.logger);
    return this.authService.localSession();
  }

  private refreshToken(req: Request): Promise<AuthTokenResult> {
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
    const principal: RefreshPrincipal = { sub, username, roles: u?.roles, tv };
    return this.authService.refresh(principal);
  }

  @Public() @Throttle({ long: { limit: 5, ttl: 60000 } }) @Post('login') login(
    @Body(createDtoPipe(LoginDto)) body: LoginDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const { username, password } = this.loginCredentials(body);
    return this.authService
      .login(username, password)
      .then((result) => this.withAuthCookie(res, result));
  }

  @Public()
  @Throttle({ long: { limit: 5, ttl: 60000 } })
  @Post('browser-login')
  browserLogin(
    @Body(createDtoPipe(LoginDto)) body: LoginDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const { username, password } = this.loginCredentials(body);
    return this.authService
      .login(username, password)
      .then((result) => this.withBrowserAuthCookie(res, result));
  }

  @Public()
  @Throttle({ long: { limit: 5, ttl: 60000 } })
  @Post('local-session')
  localSession(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.issueLocalSession(req).then((result) => this.withAuthCookie(res, result));
  }

  @Public()
  @Throttle({ long: { limit: 5, ttl: 60000 } })
  @Post('browser-local-session')
  browserLocalSession(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.issueLocalSession(req).then((result) => this.withBrowserAuthCookie(res, result));
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    clearAuthCookie(res);
    return { success: true };
  }

  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Post('refresh')
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.refreshToken(req).then((result) => this.withAuthCookie(res, result));
  }

  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Post('browser-refresh')
  browserRefresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.refreshToken(req).then((result) => this.withBrowserAuthCookie(res, result));
  }
}
