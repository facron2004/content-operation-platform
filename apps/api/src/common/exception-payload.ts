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
      // ValidationPipe often sets message to string[]; never put an array into
      // the top-level message field (clients/logs expect a string).
      message = normalizeExceptionMessage(res.message, exception.message);
      details = res;
    }
  } else if (exception instanceof Error) {
    message = exception.message;
    logUnhandled(exception.message, exception.stack);
  }
  return { status, message, details };
}

/** Coerce Nest/class-validator message shapes to a single bounded string. */
export function normalizeExceptionMessage(raw: unknown, fallback: string, maxLen = 2000): string {
  let text: string;
  if (typeof raw === 'string') {
    text = raw;
  } else if (Array.isArray(raw)) {
    text = raw
      .map((item) => (typeof item === 'string' ? item : String(item ?? '')))
      .filter(Boolean)
      .join('; ');
  } else if (raw == null) {
    text = fallback;
  } else {
    text = fallback;
  }
  if (!text) text = fallback || 'Error';
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

export function buildExceptionBody(params: {
  status: number;
  message: string;
  details: unknown;
  path?: string;
  isProduction: boolean;
}) {
  // Mask internal error messages in production for 5xx responses
  const safeMessage =
    params.isProduction && params.status >= 500 && params.status < 600
      ? 'Internal Server Error'
      : params.message;
  return buildExceptionBodyFields({ ...params, message: safeMessage }, nowISO());
}
