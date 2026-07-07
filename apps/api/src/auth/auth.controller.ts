import { Body, Controller, ForbiddenException, Inject, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, MinLength } from 'class-validator';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

class LoginDto {
  @IsString()
  @MinLength(1)
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

@ApiTags('auth')
@Controller('api/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body.username, body.password);
  }

  @Public()
  @Post('local-session')
  localSession(@Req() req: Request) {
    if (!isLoopbackRequest(req)) {
      throw new ForbiddenException('Local session is only available from this machine');
    }
    return this.authService.localSession();
  }

  @Post('refresh')
  refresh(@Req() req: Request) {
    const user = req.user as { sub?: string; userId?: string; username: string };
    return this.authService.refresh({
      sub: user.sub ?? user.userId ?? 'admin',
      username: user.username
    });
  }
}

// IPv4/IPv6 loopback + host header 中可能的 localhost 字面值
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', '::1', '0:0:0:0:0:0:0:1', 'localhost']);

function isLoopbackRequest(req: Request) {
  const candidates = [req.ip, req.socket.remoteAddress, req.headers['x-forwarded-for']]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === 'string')
    .flatMap((value) => value.split(',').map((item) => item.trim()));

  return candidates.some((value) => LOOPBACK_HOSTNAMES.has(value.replace(/^::ffff:/, '')));
}
