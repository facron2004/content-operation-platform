import { ExceptionFilter, Catch, ArgumentsHost, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { buildExceptionBody, resolveExceptionPayload } from './exception-payload';
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, message, details } = resolveExceptionPayload(exception, (msg, stack) => {
      this.logger.error(`Unhandled error: ${msg}`, stack);
    });
    response.status(status).json(
      buildExceptionBody({
        status,
        message,
        details,
        path: response.req?.url,
        isProduction: process.env.NODE_ENV === 'production'
      })
    );
  }
}
