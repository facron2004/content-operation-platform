import { Inject, Injectable } from '@nestjs/common';
import {
  CloneIamRoleDto,
  CreateIamRoleDto,
  CreateOrganizationUnitDto,
  ReplaceUserAccessDto,
  UpdateIamRoleDto,
  UpdateOrganizationUnitDto
} from './iam.dto';
import { IamOrganizationAdminService } from './iam-organization-admin.service';
import { IamRoleAdminService } from './iam-role-admin.service';
import { IamUserAccessAdminService } from './iam-user-access-admin.service';

/** Compatibility facade for the existing IAM controller and /api/users entry points. */
@Injectable()
export class IamAdminService {
  constructor(
    @Inject(IamRoleAdminService) private readonly roleAdmin: IamRoleAdminService,
    @Inject(IamOrganizationAdminService)
    private readonly organizationAdmin: IamOrganizationAdminService,
    @Inject(IamUserAccessAdminService)
    private readonly userAccessAdmin: IamUserAccessAdminService
  ) {}

  createRole(tenantId: string, dto: CreateIamRoleDto, actorId?: string) {
    return this.roleAdmin.createRole(tenantId, dto, actorId);
  }

  cloneRole(tenantId: string, roleId: string, dto: CloneIamRoleDto, actorId?: string) {
    return this.roleAdmin.cloneRole(tenantId, roleId, dto, actorId);
  }

  updateRole(tenantId: string, roleId: string, dto: UpdateIamRoleDto, actorId?: string) {
    return this.roleAdmin.updateRole(tenantId, roleId, dto, actorId);
  }

  createOrganizationUnit(tenantId: string, dto: CreateOrganizationUnitDto, actorId?: string) {
    return this.organizationAdmin.createOrganizationUnit(tenantId, dto, actorId);
  }

  updateOrganizationUnit(
    tenantId: string,
    unitId: string,
    dto: UpdateOrganizationUnitDto,
    actorId?: string
  ) {
    return this.organizationAdmin.updateOrganizationUnit(tenantId, unitId, dto, actorId);
  }

  replaceUserAccess(tenantId: string, userId: string, dto: ReplaceUserAccessDto, actorId?: string) {
    return this.userAccessAdmin.replaceUserAccess(tenantId, userId, dto, actorId);
  }
}
