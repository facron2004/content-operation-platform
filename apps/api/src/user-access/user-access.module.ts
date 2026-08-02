import { forwardRef, Inject, Logger, Module, OnModuleInit } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import {
  UserAuthService,
  UserCommandService,
  UserQueryService
} from './application/user-application.service';
import { ADMIN_PASSWORD, ADMIN_USERNAME } from '../config/auth.config';
import { AuthModule } from '../auth/auth.module';
import { IamModule } from './iam/iam.module';

@Module({
  imports: [forwardRef(() => AuthModule), IamModule],
  controllers: [UserController],
  providers: [UserService, UserAuthService, UserCommandService, UserQueryService],
  exports: [UserService, IamModule]
})
export class UserAccessModule implements OnModuleInit {
  private readonly logger = new Logger(UserAccessModule.name);

  constructor(@Inject(UserService) private readonly userService: UserService) {}

  async onModuleInit() {
    await this.userService.ensureEnvAdmin(ADMIN_USERNAME, ADMIN_PASSWORD);
    this.logger.log('Env-admin bootstrap checked');
  }
}
