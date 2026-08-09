import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RequireLogin } from '../user-access/iam/route-auth.decorator';
import { resolveReleaseVersion } from './release-manifest';

@ApiTags('system-version')
@RequireLogin()
@Controller('api/system')
export class SystemVersionController {
  @Get('version')
  @ApiOperation({ summary: 'Get current system release version and build info' })
  getVersion() {
    const memory = process.memoryUsage();
    return {
      appName: 'content-operation-platform-api',
      version: resolveReleaseVersion(),
      nodeEnv: process.env.NODE_ENV ?? 'development',
      nodeVersion: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsage: {
        heapUsedMB: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memory.heapTotal / 1024 / 1024),
        rssMB: Math.round(memory.rss / 1024 / 1024)
      },
      timestamp: new Date().toISOString()
    };
  }
}
