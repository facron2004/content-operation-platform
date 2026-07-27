import { ExceptionFilter, Catch, ArgumentsHost, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { buildExceptionBody, resolveExceptionPayload } from './exception-payload';
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as unknown as { requestId?: string }).requestId;
    const { status, message, details } = resolveExceptionPayload(exception, (msg, stack) => {
      this.logger.error(`[${requestId ?? '-'}] Unhandled error: ${msg}`, stack);
    });
    // Never echo query strings (may contain tokens) — path only.
    const safePath = (request.path || request.url || '').split('?')[0]?.slice(0, 200);
    response.status(status).json(
      buildExceptionBody({
        status,
        message,
        details,
        path: safePath,
        isProduction: process.env.NODE_ENV === 'production'
      })
    );
  }
}
