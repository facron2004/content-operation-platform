import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { WelfarePointController } from './welfare-point.controller';
import { WelfarePointService } from './welfare-point.service';

@Module({
  imports: [ContentModule],
  controllers: [WelfarePointController],
  providers: [WelfarePointService],
  exports: [WelfarePointService]
})
export class WelfarePointModule {}
