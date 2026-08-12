import { Module } from '@nestjs/common';
import { GmvModule } from '../gmv/gmv.module';
import { OverviewModule } from '../overview/overview.module';
import { OperationController } from './operation.controller';
import { OperationWorkbenchService } from './operation-workbench.service';

@Module({
  imports: [GmvModule, OverviewModule],
  controllers: [OperationController],
  providers: [OperationWorkbenchService]
})
export class OperationModule {}
