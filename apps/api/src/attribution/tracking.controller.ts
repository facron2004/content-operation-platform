import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../auth';
import { TrackingService } from './tracking.service';
import { RecordVisitDto } from './dto/record-visit.dto';

@ApiTags('tracking')
@Controller()
export class TrackingController {
  constructor(@Inject(TrackingService) private readonly svc: TrackingService) {}

  @Public()
  @Get('t/:trackingCode')
  @ApiOperation({ summary: 'Redirect handler for tracking links' })
  handleRedirect(@Param('trackingCode') trackingCode: string) {
    return this.svc.handleRedirect(trackingCode);
  }

  @Post('api/tracking/events')
  @ApiOperation({ summary: 'Record a visit event programmatically' })
  recordVisit(@Body() body: RecordVisitDto) {
    return this.svc.recordVisit(body);
  }
}
