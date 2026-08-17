import { Module } from '@nestjs/common';
import { UserCenterModule } from '../user-center/user-center.module';
import { MemberIntegralController } from './member-integral.controller';
import { MemberIntegralService } from './member-integral.service';

@Module({
  imports: [UserCenterModule],
  controllers: [MemberIntegralController],
  providers: [MemberIntegralService]
})
export class MemberIntegralModule {}
