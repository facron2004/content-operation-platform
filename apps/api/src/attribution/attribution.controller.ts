import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AttributionService } from './attribution.service';
import { ManualBindDto } from './dto/manual-bind.dto';

@ApiTags('attribution')
@Controller('api/attribution')
export class AttributionController {
  constructor(@Inject(AttributionService) private readonly svc: AttributionService) {}

  @Post('recompute')
  @ApiOperation({ summary: 'Trigger attribution matching for all active tasks' })
  recompute() {
    return this.svc.recompute();
  }

  @Get('unmatched-orders')
  @ApiOperation({ summary: 'List orders not yet attributed to any task' })
  getUnmatchedOrders() {
    return this.svc.getUnmatchedOrders();
  }

  @Post('manual-bind')
  @ApiOperation({ summary: 'Manually bind an order to a task' })
  manualBind(@Body() body: ManualBindDto) {
    return this.svc.manualBind(body);
  }

  @Post(':id/revoke')
  @ApiOperation({ summary: 'Revoke an attribution by id' })
  revoke(@Param('id') id: string) {
    return this.svc.revoke(id);
  }
}
