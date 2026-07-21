import { HttpException, HttpStatus } from '@nestjs/common';
import { isRecord } from '@content/shared';
import { nowISO } from './format';
import { buildExceptionBodyFields } from './exception-payload-body';
export function resolveExceptionPayload(
  exception: unknown,
  logUnhandled: (message: string, stack?: string) => void
) {
  let status = HttpStatus.INTERNAL_SERVER_ERROR,
    message = 'Internal Server Error',
    details: unknown;
  if (exception instanceof HttpException) {
    status = exception.getStatus();
    const res = exception.getResponse();
    if (typeof res === 'string') message = res;
    else if (isRecord(res)) {
      message = (res.message as string) ?? exception.message;
      details = res;
    }
  } else if (exception instanceof Error) {
    message = exception.message;
    logUnhandled(exception.message, exception.stack);
  }
  return { status, message, details };
}
export function buildExceptionBody(params: {
  status: number;
  message: string;
  details: unknown;
  path?: string;
  isProduction: boolean;
}) {
  return buildExceptionBodyFields(params, nowISO());
}
