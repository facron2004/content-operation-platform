import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { createDtoPipe } from '../common/dto-pipe';
import { safePathId } from '../common/path-id';
import { assertUnrestrictedAnalytics } from '../user-access/scope-guards';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { OrderCenterListQueryDto } from './order-center.dto';
import { OrderCenterService } from './order-center.service';
import { OrderTransactionService } from './order-transaction.service';

@ApiTags('order-center')
@RequireLogin()
@Controller('api/order-center')
export class OrderCenterController {
  constructor(
    @Inject(OrderCenterService) private readonly service: OrderCenterService,
    @Inject(OrderTransactionService) private readonly transactionService: OrderTransactionService
  ) {}

  @Get('orders')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: '订单中心列表',
    description: '订单分页、状态和商品类目筛选及支付/核销/退款摘要'
  })
  list(
    @Query(createDtoPipe(OrderCenterListQueryDto)) query: OrderCenterListQueryDto,
    @Req() req: Request
  ) {
    assertUnrestrictedAnalytics(req);
    return this.service.listOrders(query);
  }

  @Get('orders/:orderId')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: '订单中心详情', description: '订单金额、节点时间及用户/商品关联信息' })
  async detail(@Param('orderId') orderId: string, @Req() req: Request) {
    assertUnrestrictedAnalytics(req);
    return this.service.getOrder(safePathId(orderId));
  }

  @Get('orders/:orderId/transactions')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 60, ttl: 60000 } })
  transactions(@Param('orderId') orderId: string, @Req() req: Request) {
    assertUnrestrictedAnalytics(req);
    return this.transactionService.getTimeline(safePathId(orderId));
  }
}
