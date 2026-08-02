import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  Put,
  Req
} from '@nestjs/common';
import type { Request } from 'express';
import { createDtoPipe } from '../../common/dto-pipe';
import { safePathId } from '../../common/path-id';
import { JwtStrategy } from '../../auth/jwt.strategy';
import { IamAccessService } from './iam-access.service';
import { IamAdminService } from './iam-admin.service';
import {
  CloneIamRoleDto,
  CreateIamRoleDto,
  CreateOrganizationUnitDto,
  ReplaceUserAccessDto,
  UpdateIamRoleDto,
  UpdateOrganizationUnitDto
} from './iam.dto';
import { RequirePermissions } from './require-permissions.decorator';

@Controller('api/iam')
export class IamController {
  constructor(
    @Inject(IamAccessService) private readonly accessService: IamAccessService,
    @Inject(IamAdminService) private readonly adminService: IamAdminService,
    @Optional() @Inject(JwtStrategy) private readonly jwtStrategy?: JwtStrategy
  ) {}

  @Get('permissions')
  @RequirePermissions('iam:permissions:read')
  listPermissions() {
    return this.accessService.listPermissions();
  }

  @Get('roles')
  @RequirePermissions('iam:roles:read')
  listRoles(@Req() req: Request) {
    const tenantId = (req.user as { tenantId?: string } | undefined)?.tenantId;
    return this.accessService.listRoles(tenantId ?? 'tenant_default');
  }

  @Post('roles')
  @RequirePermissions('iam:roles:write')
  createRole(@Body(createDtoPipe(CreateIamRoleDto)) body: CreateIamRoleDto, @Req() req: Request) {
    const user = req.user as { tenantId?: string; userId?: string } | undefined;
    return this.adminService.createRole(user?.tenantId ?? 'tenant_default', body, user?.userId);
  }

  @Patch('roles/:id')
  @RequirePermissions('iam:roles:write')
  updateRole(
    @Param('id') id: string,
    @Body(createDtoPipe(UpdateIamRoleDto)) body: UpdateIamRoleDto,
    @Req() req: Request
  ) {
    const user = req.user as { tenantId?: string; userId?: string } | undefined;
    return this.adminService.updateRole(
      user?.tenantId ?? 'tenant_default',
      safePathId(id),
      body,
      user?.userId
    );
  }

  @Post('roles/:id/clone')
  @RequirePermissions('iam:roles:write')
  cloneRole(
    @Param('id') id: string,
    @Body(createDtoPipe(CloneIamRoleDto)) body: CloneIamRoleDto,
    @Req() req: Request
  ) {
    const user = req.user as { tenantId?: string; userId?: string } | undefined;
    return this.adminService.cloneRole(
      user?.tenantId ?? 'tenant_default',
      safePathId(id),
      body,
      user?.userId
    );
  }

  @Put('roles/:id/permissions')
  @RequirePermissions('iam:roles:write')
  updateRolePermissions(
    @Param('id') id: string,
    @Body(createDtoPipe(UpdateIamRoleDto)) body: UpdateIamRoleDto,
    @Req() req: Request
  ) {
    const user = req.user as { tenantId?: string; userId?: string } | undefined;
    return this.adminService.updateRole(
      user?.tenantId ?? 'tenant_default',
      safePathId(id),
      { permissionCodes: body.permissionCodes ?? [] },
      user?.userId
    );
  }

  @Get('organizations')
  @RequirePermissions('iam:org:read')
  listOrganizations(@Req() req: Request) {
    const tenantId = (req.user as { tenantId?: string } | undefined)?.tenantId;
    return this.accessService.listOrganizationUnits(tenantId ?? 'tenant_default');
  }

  @Get('org-units/tree')
  @RequirePermissions('iam:org:read')
  listOrganizationTree(@Req() req: Request) {
    const tenantId = (req.user as { tenantId?: string } | undefined)?.tenantId;
    return this.accessService.listOrganizationTree(tenantId ?? 'tenant_default');
  }

  @Post(['organizations', 'org-units'])
  @RequirePermissions('iam:org:write')
  createOrganization(
    @Body(createDtoPipe(CreateOrganizationUnitDto)) body: CreateOrganizationUnitDto,
    @Req() req: Request
  ) {
    const user = req.user as { tenantId?: string; userId?: string } | undefined;
    return this.adminService.createOrganizationUnit(
      user?.tenantId ?? 'tenant_default',
      body,
      user?.userId
    );
  }

  @Patch(['organizations/:id', 'org-units/:id'])
  @RequirePermissions('iam:org:write')
  updateOrganization(
    @Param('id') id: string,
    @Body(createDtoPipe(UpdateOrganizationUnitDto)) body: UpdateOrganizationUnitDto,
    @Req() req: Request
  ) {
    const user = req.user as { tenantId?: string; userId?: string } | undefined;
    return this.adminService.updateOrganizationUnit(
      user?.tenantId ?? 'tenant_default',
      safePathId(id),
      body,
      user?.userId
    );
  }

  @Get('users/:id/access')
  @RequirePermissions('iam:users:access')
  async getUserAccess(@Param('id') id: string, @Req() req: Request) {
    const tenantId = (req.user as { tenantId?: string } | undefined)?.tenantId;
    const access = await this.accessService.getUserAccess(safePathId(id), tenantId);
    if (!access) throw new NotFoundException('用户不存在或不属于当前租户');
    return access;
  }

  @Put('users/:id/access')
  @RequirePermissions('iam:users:access')
  async replaceUserAccess(
    @Param('id') id: string,
    @Body(createDtoPipe(ReplaceUserAccessDto)) body: ReplaceUserAccessDto,
    @Req() req: Request
  ) {
    const user = req.user as { tenantId?: string; userId?: string } | undefined;
    const result = await this.adminService.replaceUserAccess(
      user?.tenantId ?? 'tenant_default',
      safePathId(id),
      body,
      user?.userId
    );
    this.jwtStrategy?.invalidateStatus(safePathId(id));
    return result;
  }
}
