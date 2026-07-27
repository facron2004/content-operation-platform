import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = randomUUID();
    (req as unknown as { requestId?: string }).requestId = requestId;
    res.setHeader('x-request-id', requestId);

    const { method } = req;
    // Never log query strings — may contain tokens / PII.
    const pathOnly = (req.path || req.originalUrl || '').split('?')[0]?.slice(0, 200) || '/';
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      this.logger.log(`[${requestId}] ${method} ${pathOnly} ${res.statusCode} ${duration}ms`);
    });

    next();
  }
}
