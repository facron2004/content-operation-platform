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
    const requestId = (request as Record<string, unknown>).requestId as string | undefined;
    const { status, message, details } = resolveExceptionPayload(exception, (msg, stack) => {
      this.logger.error(`[${requestId ?? '-'}] Unhandled error: ${msg}`, stack);
    });
    response.status(status).json(
      buildExceptionBody({
        status,
        message,
        details,
        path: request.url,
        isProduction: process.env.NODE_ENV === 'production'
      })
    );
  }
}
