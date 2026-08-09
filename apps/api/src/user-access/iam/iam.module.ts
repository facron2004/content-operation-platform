import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { IamAccessService } from './iam-access.service';
import { IamAdminService } from './iam-admin.service';
import { IamOrganizationAdminService } from './iam-organization-admin.service';
import { IamRoleAdminService } from './iam-role-admin.service';
import { IamController } from './iam.controller';
import { IamShadowService } from './iam-shadow.service';
import { IamUserAccessAdminService } from './iam-user-access-admin.service';
import { PermissionGuard } from './permission.guard';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [IamController],
  providers: [
    IamAccessService,
    IamRoleAdminService,
    IamOrganizationAdminService,
    IamUserAccessAdminService,
    IamAdminService,
    IamShadowService,
    PermissionGuard
  ],
  exports: [IamAccessService, IamAdminService, IamShadowService, PermissionGuard]
})
export class IamModule {}
