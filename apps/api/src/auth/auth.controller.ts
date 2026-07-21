import { Body, Controller, Inject, Logger, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, MinLength } from 'class-validator';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { assertLocalSessionAllowed } from './auth-local-session';
class LoginDto {
  @IsString() @MinLength(1) username!: string;
  @IsString() @MinLength(1) password!: string;
}
@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}
  @Public() @Throttle({ default: { limit: 5, ttl: 60000 } }) @Post('login') login(
    @Body() body: LoginDto
  ) {
    return this.authService.login(body.username, body.password);
  }
  @Public() @Post('local-session') localSession(@Req() req: Request) {
    assertLocalSessionAllowed(req, this.logger);
    return this.authService.localSession();
  }
  @Post('refresh') refresh(@Req() req: Request) {
    const u = req.user as { sub?: string; userId?: string; username: string; roles?: string[] };
    return this.authService.refresh({
      sub: u.sub ?? u.userId ?? 'admin',
      username: u.username,
      roles: u.roles
    });
  }
}
