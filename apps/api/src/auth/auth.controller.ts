import { Controller, Post, Body, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
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
  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body.username, body.password);
  }
}
