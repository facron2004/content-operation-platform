import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  Logger
} from '@nestjs/common';
import { tap } from 'rxjs/operators';
import type { Observable } from 'rxjs';
import { AuditLogService } from './audit-log.service';

/**
 * Interceptor that automatically logs mutation requests (POST, PATCH, PUT, DELETE)
 * to the OperationAuditLog table. Fires asynchronously and silently fails.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(@Inject(AuditLogService) private readonly auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const { method, path, route } = req;

    // Skip read-only methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return next.handle();

    return next.handle().pipe(
      tap((responseBody) => {
        const action = `${method} ${route?.path || path}`;
        const pathParts = (path as string).split('/').filter(Boolean);
        const objectType = pathParts[1] || 'unknown';
        const isMutation =
          method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';

        if (!isMutation) return;

        const entryBody =
          typeof responseBody === 'object' && responseBody !== null
            ? safeStringify(responseBody)
            : undefined;

        this.auditLogService
          .tryLog({
            userId: req.user?.userId,
            username: req.user?.username,
            action,
            objectType,
            objectId: req.params?.id || extractIdFromBody(responseBody),
            before: method === 'PATCH' || method === 'PUT' ? safeStringify(req.body) : undefined,
            after: method === 'POST' ? entryBody : undefined,
            result: 'success',
            ip: req.ip
          })
          .catch(() => {});
      })
    );
  }
}

function safeStringify(obj: unknown): string | undefined {
  try {
    return JSON.stringify(obj);
  } catch {
    return undefined;
  }
}

function extractIdFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  return (b.id ?? b.userId ?? b.logId ?? b.campaignId) as string | undefined;
}
