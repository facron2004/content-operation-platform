import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Inject,
  Logger,
  Req
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { Request } from 'express';
import { USER_ROLES } from '@content/shared';
import type { UserRole } from '@content/shared';
import { UserService } from './user.service';
import { Roles } from './role.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateUserRolesDto } from './dto/update-user.dto';
import { JwtStrategy } from '../auth/jwt.strategy';
import { safePathId } from '../common/path-id';
import { createDtoPipe } from '../common/dto-pipe';

type AuthUser = {
  userId: string;
  username: string;
  roles?: string[];
  bindings?: Array<{ role: string; scopeType?: string; scopeId?: string }>;
};

function isAdmin(user: AuthUser | undefined): boolean {
  return Boolean(user?.roles?.includes('admin'));
}

/** Drop internal session epoch — clients never need tokenVersion; only JWT minting does. */
function publicUser<T extends { tokenVersion?: number }>(user: T): Omit<T, 'tokenVersion'> {
  const { tokenVersion: _hidden, ...rest } = user;
  return rest;
}

class UserListQueryDto {
  // Residual #205: SPA listUsers client already accepted keyword; DTO was stripping it.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  // Residual #208: filter 启用/停用 (0|1) — same pattern as CommunityQueryDto.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1)
  isActive?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

@ApiTags('users')
@Controller('api/users')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(
    @Inject(UserService) private readonly userService: UserService,
    @Optional() @Inject(JwtStrategy) private readonly jwtStrategy?: JwtStrategy
  ) {}

  @Get()
  @Roles('admin', 'platform_operator')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'List users with roles (admin only)' })
  async listUsers(@Query(createDtoPipe(UserListQueryDto)) query: UserListQueryDto) {
    // Residual #205/#208: keyword + isActive (0|1) pass-through.
    const result = await this.userService.list(query.page ?? 1, query.pageSize ?? 20, {
      keyword: query.keyword,
      isActive: query.isActive
    });
    return { ...result, data: result.data.map(publicUser) };
  }

  @Post()
  @Roles('admin', 'platform_operator')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Create user (admin only)' })
  async createUser(@Body(createDtoPipe(CreateUserDto)) body: CreateUserDto, @Req() req: Request) {
    const actor = req.user as AuthUser | undefined;
    // Only admin may mint unrestricted roles (admin/platform_operator/auditor).
    const adminActor = isAdmin(actor);
    // Residual #170: slim success shell (SPA discards body + reloads list).
    return this.userService.create(body, {
      allowAdminRole: adminActor,
      allowUnrestrictedRoles: adminActor
    });
  }

  @Get('me')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Current user profile' })
  async getProfile(@Req() req: Request) {
    const authUser = req.user as AuthUser | undefined;
    if (!authUser?.userId) return null;
    const user = await this.userService.findById(authUser.userId);
    if (user) return publicUser(user);
    // Hardcoded-admin JWT (sub=admin) has no AppUser row until seeded.
    // Return a synthetic profile from the token so the SPA can hydrate roles.
    const roleSet = new Set<string>(USER_ROLES);
    const roles = (authUser.roles ?? []).filter((role): role is UserRole => roleSet.has(role));
    return {
      userId: authUser.userId,
      username: authUser.username,
      displayName: authUser.username,
      isActive: true,
      roles: roles.map((role, index) => ({
        id: `jwt-role-${index}`,
        userId: authUser.userId,
        role
      })),
      createdAt: new Date(0).toISOString()
    };
  }

  @Get(':id')
  @Roles('admin', 'platform_operator')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'User detail with role bindings' })
  async getUser(@Param('id') id: string) {
    const user = await this.userService.findById(safePathId(id));
    return user ? publicUser(user) : user;
  }

  @Patch(':id')
  @Roles('admin', 'platform_operator')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Update user info' })
  async updateUser(
    @Param('id') id: string,
    @Body(createDtoPipe(UpdateUserDto)) body: UpdateUserDto,
    @Req() req: Request
  ) {
    const safeId = safePathId(id);
    const actor = req.user as AuthUser | undefined;
    await this.assertCanMutateTarget(safeId, actor);
    // Password / isActive changes are admin-only — prevents lateral peer takeover.
    if ((body.password !== undefined || body.isActive !== undefined) && !isAdmin(actor)) {
      throw new ForbiddenException('仅 admin 可重置密码或修改启用状态');
    }
    // Prevent self-deactivation via PATCH isActive=false.
    if (body.isActive === false && actor?.userId && actor.userId === safeId) {
      throw new ForbiddenException('不能停用当前登录账号');
    }
    // Residual #169: slim success shell (SPA list reloads; no AppUser body).
    const result = await this.userService.update(safeId, body);
    if (body.password !== undefined || body.isActive !== undefined) {
      this.jwtStrategy?.invalidateStatus(safeId);
    }
    return result;
  }

  @Post(':id/deactivate')
  @Roles('admin')
  @Throttle({ long: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Deactivate user (isActive=false)' })
  async deactivateUser(@Param('id') id: string, @Req() req: Request) {
    const safeId = safePathId(id);
    const actor = req.user as AuthUser | undefined;
    // Prevent accidental / malicious self-lockout of the last admin session.
    if (actor?.userId && actor.userId === safeId) {
      throw new ForbiddenException('不能停用当前登录账号');
    }
    await this.assertCanMutateTarget(safeId, actor);
    // Residual #169: slim success shell (SPA discards body + reloads list).
    const result = await this.userService.deactivate(safeId);
    this.jwtStrategy?.invalidateStatus(safeId);
    return result;
  }

  @Post(':id/roles')
  @Roles('admin', 'platform_operator')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Update role bindings' })
  async updateUserRoles(
    @Param('id') id: string,
    @Body(createDtoPipe(UpdateUserRolesDto)) body: UpdateUserRolesDto,
    @Req() req: Request
  ) {
    const safeId = safePathId(id);
    const actor = req.user as AuthUser | undefined;
    await this.assertCanMutateTarget(safeId, actor);
    const adminActor = isAdmin(actor);
    // Residual #169: slim success shell (SPA discards body + reloads list).
    const result = await this.userService.updateRoles(safeId, body, {
      allowAdminRole: adminActor,
      allowUnrestrictedRoles: adminActor
    });
    this.jwtStrategy?.invalidateStatus(safeId);
    return result;
  }

  /**
   * Non-admin must not mutate users who hold any unrestricted role
   * (admin / platform_operator / auditor) — blocks lateral peer demotion.
   * Residual #115: role-only probe (no full AppUser + bindings load).
   */
  private async assertCanMutateTarget(targetId: string, actor: AuthUser | undefined) {
    if (isAdmin(actor)) return;
    if (await this.userService.hasUnrestrictedPeerRole(targetId)) {
      throw new ForbiddenException('仅 admin 可修改无数据范围限制角色用户');
    }
  }
}
