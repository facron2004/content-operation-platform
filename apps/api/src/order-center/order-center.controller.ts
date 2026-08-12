import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
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
import {
  ApproveRefundDto,
  CompleteRefundDto,
  RejectRefundDto,
  RequestRefundDto,
  VerifyOrderDto
} from './transaction-core.dto';
import { OrderTransactionService } from './order-transaction.service';
import { IdempotencyGuard } from '../idempotency/idempotency.guard';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { RequireIdempotency } from '../idempotency/require-idempotency.decorator';
import type { AuthUser } from '../distribution-task/distribution-task-controller-helpers';

@ApiTags('order-center')
@RequireLogin()
@UseInterceptors(IdempotencyInterceptor)
@Controller('api/order-center')
export class OrderCenterController {
  constructor(
    @Inject(OrderCenterService) private readonly service: OrderCenterService,
    @Inject(OrderTransactionService) private readonly transactionService: OrderTransactionService
  ) {}

  @Get('orders')
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: '订单中心列表', description: '订单分页、状态筛选和支付/核销/退款摘要' })
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

  @Post('orders/:orderId/verify')
  @RequirePermissions('orders:manage')
  @RequireIdempotency('verification')
  @UseGuards(IdempotencyGuard)
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  verify(
    @Param('orderId') orderId: string,
    @Body(createDtoPipe(VerifyOrderDto)) body: VerifyOrderDto,
    @Req() req: Request
  ) {
    return this.transactionService.verify(
      safePathId(orderId),
      body,
      actorOf(req),
      req.get('Idempotency-Key')?.trim()
    );
  }

  @Post('orders/:orderId/refund-requests')
  @RequirePermissions('orders:manage')
  @RequireIdempotency('refund')
  @UseGuards(IdempotencyGuard)
  @Throttle({ long: { limit: 20, ttl: 60000 } })
  requestRefund(
    @Param('orderId') orderId: string,
    @Body(createDtoPipe(RequestRefundDto)) body: RequestRefundDto,
    @Req() req: Request
  ) {
    return this.transactionService.requestRefund(
      safePathId(orderId),
      body,
      actorOf(req),
      req.get('Idempotency-Key')?.trim()
    );
  }

  @Post('refund-requests/:refundId/approve')
  @RequirePermissions('orders:manage')
  @RequireIdempotency('refund')
  @UseGuards(IdempotencyGuard)
  approveRefund(
    @Param('refundId') refundId: string,
    @Body(createDtoPipe(ApproveRefundDto)) body: ApproveRefundDto,
    @Req() req: Request
  ) {
    return this.transactionService.approveRefund(
      safePathId(refundId),
      body,
      actorOf(req),
      req.get('Idempotency-Key')?.trim()
    );
  }

  @Post('refund-requests/:refundId/complete')
  @RequirePermissions('orders:manage')
  @RequireIdempotency('refund')
  @UseGuards(IdempotencyGuard)
  completeRefund(
    @Param('refundId') refundId: string,
    @Body(createDtoPipe(CompleteRefundDto)) body: CompleteRefundDto,
    @Req() req: Request
  ) {
    const requestId = req.get('Idempotency-Key')?.trim();
    return this.transactionService.completeRefund(
      safePathId(refundId),
      body,
      actorOf(req),
      requestId ?? ''
    );
  }

  @Post('refund-requests/:refundId/reject')
  @RequirePermissions('orders:manage')
  @RequireIdempotency('refund')
  @UseGuards(IdempotencyGuard)
  rejectRefund(
    @Param('refundId') refundId: string,
    @Body(createDtoPipe(RejectRefundDto)) body: RejectRefundDto,
    @Req() req: Request
  ) {
    return this.transactionService.rejectRefund(
      safePathId(refundId),
      body,
      actorOf(req),
      req.get('Idempotency-Key')?.trim()
    );
  }
}

function actorOf(req: Request): AuthUser {
  const actor = req.user as Partial<AuthUser> | undefined;
  return { userId: actor?.userId, username: actor?.username } as AuthUser;
}
