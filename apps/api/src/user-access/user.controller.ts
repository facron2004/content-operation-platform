import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Inject,
  Logger,
  Req
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';
import { UserService } from './user.service';
import { Roles } from './role.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateUserRolesDto } from './dto/update-user.dto';

@ApiTags('users')
@Controller('api/users')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(@Inject(UserService) private readonly userService: UserService) {}

  @Get()
  @Roles('admin', 'platform_operator')
  @ApiOperation({ summary: 'List users with roles (admin only)' })
  listUsers(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const p = Number(page);
    const ps = Number(pageSize);
    return this.userService.list(Number.isFinite(p) ? p : 1, Number.isFinite(ps) ? ps : 20);
  }

  @Post()
  @Roles('admin', 'platform_operator')
  @ApiOperation({ summary: 'Create user (admin only)' })
  createUser(@Body() body: CreateUserDto) {
    return this.userService.create(body);
  }

  @Get('me')
  @ApiOperation({ summary: 'Current user profile' })
  getProfile(@Req() req: Request) {
    const authUser = req.user as { userId: string; username: string } | undefined;
    return this.userService.findById(authUser?.userId ?? '');
  }

  @Get(':id')
  @Roles('admin', 'platform_operator')
  @ApiOperation({ summary: 'User detail with role bindings' })
  getUser(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Patch(':id')
  @Roles('admin', 'platform_operator')
  @ApiOperation({ summary: 'Update user info' })
  updateUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.userService.update(id, body);
  }

  @Post(':id/deactivate')
  @Roles('admin', 'platform_operator')
  @ApiOperation({ summary: 'Deactivate user (isActive=false)' })
  deactivateUser(@Param('id') id: string) {
    return this.userService.deactivate(id);
  }

  @Post(':id/roles')
  @Roles('admin', 'platform_operator')
  @ApiOperation({ summary: 'Update role bindings' })
  updateUserRoles(@Param('id') id: string, @Body() body: UpdateUserRolesDto) {
    return this.userService.updateRoles(id, body);
  }
}
