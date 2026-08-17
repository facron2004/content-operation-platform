import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { createDtoPipe } from '../common/dto-pipe';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { MemberIntegralRecordQueryDto } from './member-integral.dto';
import { MemberIntegralService } from './member-integral.service';

@ApiTags('member-integral-records')
@RequireLogin()
@Controller('api/member-integral-records')
export class MemberIntegralController {
  constructor(@Inject(MemberIntegralService) private readonly service: MemberIntegralService) {}

  @Get()
  @RequirePermissions('analytics:read')
  @Throttle({ long: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: '会员积分记录分页列表',
    description: '只抓取请求页，串行访问 JeeSite 并缓存当前页'
  })
  list(@Query(createDtoPipe(MemberIntegralRecordQueryDto)) query: MemberIntegralRecordQueryDto) {
    return this.service.query(query);
  }
}
