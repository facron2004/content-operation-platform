import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { AttributionService } from './attribution.service';
import { ManualBindDto } from './dto/manual-bind.dto';
import { Roles } from '../user-access/role.decorator';
import { safePathId } from '../common/path-id';
import { createDtoPipe } from '../common/dto-pipe';

class UnmatchedOrdersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

@ApiTags('attribution')
@Controller('api/attribution')
export class AttributionController {
  constructor(@Inject(AttributionService) private readonly svc: AttributionService) {}

  @Roles('admin', 'platform_operator')
  @Throttle({ long: { limit: 3, ttl: 60000 } })
  @Post('recompute')
  @ApiOperation({ summary: 'Trigger attribution matching for all active tasks' })
  recompute() {
    return this.svc.recompute();
  }

  @Roles('admin', 'platform_operator', 'auditor')
  // Full-table COUNT + NOT EXISTS scan — throttle so concurrent tabs cannot pin SQLite.
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Get('unmatched-orders')
  @ApiOperation({ summary: 'List orders not yet attributed to any task (paginated)' })
  getUnmatchedOrders(
    @Query(createDtoPipe(UnmatchedOrdersQueryDto)) query: UnmatchedOrdersQueryDto
  ) {
    return this.svc.getUnmatchedOrders(query.page, query.pageSize);
  }

  @Roles('admin', 'platform_operator')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Post('manual-bind')
  @ApiOperation({ summary: 'Manually bind an order to a task' })
  manualBind(@Body(createDtoPipe(ManualBindDto)) body: ManualBindDto) {
    return this.svc.manualBind(body);
  }

  @Roles('admin', 'platform_operator')
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  @Post(':id/revoke')
  @ApiOperation({ summary: 'Revoke an attribution by id' })
  revoke(@Param('id') id: string) {
    return this.svc.revoke(safePathId(id));
  }
}
