import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { isRecord } from '@content/shared';
import { nowISO } from './format';
import type { Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal Server Error';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (isRecord(res)) {
        message = (res.message as string) ?? exception.message;
        details = res;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
    }

    // Mask sensitive error details in production
    const isProduction = process.env.NODE_ENV === 'production';
    const body: Record<string, unknown> = {
      statusCode: status,
      message,
      timestamp: nowISO(),
      path: response.req?.url
    };

    if (details && !isProduction) {
      body.details = details;
    }

    response.status(status).json(body);
  }
}
