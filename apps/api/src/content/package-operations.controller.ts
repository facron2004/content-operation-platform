import { Controller, Inject, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { ContentService } from './content.service';
import { AutoLoginService } from './auto-login.service';
import { Roles } from '../user-access/role.decorator';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { RequirePermissions } from '../user-access/iam/require-permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { geocodeMerchantsFromPartnerShop } from '../merchant/merchant-geocoder';

@ApiTags('packages')
@RequireLogin()
@Controller('api/content')
export class PackageOperationsController {
  constructor(
    @Inject(ContentService) private readonly contentService: ContentService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(AutoLoginService) private readonly autoLoginService: AutoLoginService
  ) {}

  @Roles('admin', 'platform_operator')
  @RequirePermissions('packages:refresh')
  @Throttle({ long: { limit: 2, ttl: 60000 } })
  @Post('inventory/daily-crawl')
  crawlDailyInventory(@Query('date') date?: string) {
    // Only accept ISO dates — free-form strings must not reach crawler SQL.
    const safeDate =
      typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
    return this.contentService.crawlDailyInventory(safeDate);
  }

  @Roles('admin')
  @RequirePermissions('packages:write')
  @Throttle({ long: { limit: 2, ttl: 60000 } })
  @Post('sync-merchants')
  @ApiOperation({ summary: '从 JeeSite 拉取套餐数据并同步商家地址到 Merchant 表' })
  syncMerchants() {
    return this.contentService.syncMerchantsFromJeeSite();
  }

  @Roles('admin')
  @RequirePermissions('packages:write')
  @Throttle({ long: { limit: 2, ttl: 60000 } })
  @Post('geocode-merchants')
  @ApiOperation({ summary: '从 JeeSite 合作商店铺表抓取 longitude/latitude 回填 Merchant 表' })
  geocodeMerchants() {
    return geocodeMerchantsFromPartnerShop(this.prisma, this.configService, this.autoLoginService);
  }

  @Roles('admin')
  @RequirePermissions('packages:write')
  @Throttle({ long: { limit: 2, ttl: 60000 } })
  @Post('geocode-from-partner-shop')
  @ApiOperation({ summary: '从 JeeSite 合作商店铺表抓取 longitude/latitude（别名）' })
  geocodeFromPartnerShop() {
    return geocodeMerchantsFromPartnerShop(this.prisma, this.configService, this.autoLoginService);
  }
}
