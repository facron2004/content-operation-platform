import { forwardRef, Inject, Logger, Module, OnModuleInit } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { ADMIN_PASSWORD, ADMIN_USERNAME } from '../config/auth.config';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService]
})
export class UserAccessModule implements OnModuleInit {
  private readonly logger = new Logger(UserAccessModule.name);

  constructor(@Inject(UserService) private readonly userService: UserService) {}

  async onModuleInit() {
    // Bootstrap env-admin into AppUser so JWT status checks and /me work without
    // the synthetic sub=admin fallback. Safe no-op if row already exists.
    await this.userService.ensureEnvAdmin(ADMIN_USERNAME, ADMIN_PASSWORD);
    this.logger.log('Env-admin bootstrap checked');
  }
}
