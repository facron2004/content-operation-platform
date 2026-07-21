import { Module } from '@nestjs/common';
import { TrackingController } from './tracking.controller';
import { AttributionController } from './attribution.controller';
import { TrackingService } from './tracking.service';
import { AttributionService } from './attribution.service';

@Module({
  controllers: [TrackingController, AttributionController],
  providers: [TrackingService, AttributionService],
  exports: [AttributionService]
})
export class AttributionModule {}
