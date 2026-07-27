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
import { safeStringifyRedacted } from '../common/redact-sensitive';
import { AuditLogService } from './audit-log.service';

/**
 * Interceptor that automatically logs mutation requests (POST, PATCH, PUT, DELETE)
 * to the OperationAuditLog table. Fires asynchronously and silently fails.
 * Bodies are redacted so password / cookie / apiKey never land in the audit table.
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
    // Skip high-volume public telemetry / token-mint endpoints (login is kept so
    // successful authentications still leave an audit trail; response is redacted).
    const pathStr = typeof path === 'string' ? path : '';
    if (shouldSkipAuditPath(pathStr)) return next.handle();

    // Bulk free-form bodies (import/generate/collect) still leave a trail but
    // never store before/after payloads — rawData/markdown can embed PII.
    const omitBodies = shouldOmitAuditBodies(pathStr);

    return next.handle().pipe(
      tap((responseBody) => {
        const action = `${method} ${route?.path || path}`;
        const pathParts = (path as string).split('/').filter(Boolean);
        const objectType = pathParts[1] || 'unknown';
        const isMutation =
          method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';

        if (!isMutation) return;

        const entryBody =
          !omitBodies && typeof responseBody === 'object' && responseBody !== null
            ? safeStringifyRedacted(responseBody)
            : undefined;

        this.auditLogService
          .tryLog({
            userId: req.user?.userId,
            username: req.user?.username,
            action,
            objectType,
            objectId: req.params?.id || extractIdFromBody(responseBody),
            // Always redact request body for mutations (password / cookie / apiKey).
            before:
              !omitBodies && (method === 'PATCH' || method === 'PUT' || method === 'POST')
                ? safeStringifyRedacted(req.body)
                : undefined,
            after:
              !omitBodies && (method === 'POST' || method === 'PATCH' || method === 'PUT')
                ? entryBody
                : undefined,
            result: 'success',
            ip: req.ip
          })
          .catch(() => {});
      })
    );
  }
}

function extractIdFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  const candidate = b.id ?? b.userId ?? b.logId ?? b.campaignId ?? b.taskId ?? b.packageId;
  return typeof candidate === 'string' ? candidate : undefined;
}

/** High-volume public paths that would drown the audit table. */
function shouldSkipAuditPath(path: string): boolean {
  return (
    path.startsWith('/api/tracking') ||
    path.startsWith('/t/') ||
    path.includes('/health') ||
    path.includes('/auth/local-session') ||
    path.includes('/auth/refresh')
  );
}

/**
 * Authenticated bulk endpoints whose request/response bodies embed free-form
 * PII or multi-KB text. Still audit who/when/action; drop before/after payloads.
 */
function shouldOmitAuditBodies(path: string): boolean {
  return (
    path.includes('/import') ||
    path.includes('/generate') ||
    path.includes('/soldout-links/collect') ||
    // Heavy admin jobs already leave who/when/action; bodies are multi-KB or binary-ish.
    path.includes('/export') ||
    path.includes('/gmv/refresh') ||
    path.includes('/merchant-sales/refresh') ||
    path.includes('/attribution/recompute') ||
    path.includes('/sync-merchants') ||
    path.includes('/refresh-addresses')
  );
}
