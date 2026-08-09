import { ForbiddenException, type Logger } from '@nestjs/common';
import type { Request } from 'express';
import { isDesktopRuntime } from '../config/runtime.config';
import { isLoopbackRemoteAddress } from './auth-loopback';
export function assertLocalSessionAllowed(req: Request, logger: Logger): void {
  const env = process.env.NODE_ENV;
  const isDesktop = isDesktopRuntime();
  if (env !== 'development' && env !== 'test' && !isDesktop) {
    logger.warn(
      `拒绝 local-session: NODE_ENV=${env}, ip=${req.ip}, remote=${req.socket.remoteAddress}`
    );
    throw new ForbiddenException('Local session is only available in development mode');
  }
  if (!isLoopbackRemoteAddress(req.socket.remoteAddress)) {
    logger.warn(`拒绝 local-session: 非本机远程请求 remoteAddress=${req.socket.remoteAddress}`);
    throw new ForbiddenException('Local session is only available from this machine');
  }
}
