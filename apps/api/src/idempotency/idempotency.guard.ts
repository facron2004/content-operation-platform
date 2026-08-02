import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
  ConflictException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdempotencyService } from './idempotency.service';

/** Operations for which idempotency is REQUIRED (PRD §7.8.1). */
export const IDEMPOTENT_OPERATIONS = [
  'create-task',
  'batch-create-tasks',
  'publish-task',
  'refund',
  'amount-settlement',
  'data-backfill',
  'task-rerun',
  'message-consume',
  'campaign-start',
  'batch-import'
] as const;

export type IdempotentOperation = (typeof IDEMPOTENT_OPERATIONS)[number];

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const IDEMPOTENCY_OP_HEADER = 'Idempotency-Operation';

/**
 * NestJS guard that enforces idempotency for POST/PUT/PATCH endpoints.
 *
 * Usage:
 *   @UseGuards(IdempotencyGuard)
 *   @Post()
 *   async create(@Body() body: CreateDto) { ... }
 *
 * When Idempotency-Key header is present:
 *   - First request: executes normally, caches result
 *   - Same key + same body: returns cached result
 *   - Same key + different body: 409 Conflict
 *   - Different key: treated as new request
 *   - No header: passes through (existing non-idempotent behavior)
 */
@Injectable()
export class IdempotencyGuard implements CanActivate {
  constructor(
    @Inject(IdempotencyService) private readonly svc: IdempotencyService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const method = request.method?.toUpperCase();

    // Only guard mutating methods
    if (!['POST', 'PUT', 'PATCH'].includes(method)) return true;

    const idempotencyKey = request.headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()] as
      string | undefined;
    if (!idempotencyKey) return true; // No key = pass through

    const operationType =
      (request.headers[IDEMPOTENCY_OP_HEADER.toLowerCase()] as string) ??
      this.guessOperation(request);
    const requestHash = this.svc.hashRequest(request.body);

    // Look for existing record
    const existing = await this.svc.findRecord(idempotencyKey, operationType);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        // Same key, different body — reject
        throw new ConflictException('幂等键冲突：相同 Idempotency-Key 但请求内容不同');
      }
      if (existing.status === 'completed' && existing.responseData) {
        // Replay cached response
        const cached = JSON.parse(existing.responseData);
        // Attach the cached data to request so the handler can short-circuit
        request.__idempotentCached = cached;
        return true;
      }
      // Pending or failed — let the request proceed
      return true;
    }

    // Create new record
    const record = await this.svc.tryCreate(idempotencyKey, operationType, requestHash);
    if (!record) {
      // Race: another request created the record first
      const winner = await this.svc.findRecord(idempotencyKey, operationType);
      if (winner) {
        if (winner.requestHash !== requestHash) {
          throw new ConflictException('幂等键冲突：相同 Idempotency-Key 但请求内容不同');
        }
        return true;
      }
    }

    // Store record id on request so the response interceptor can update it
    request.__idempotencyRecordId = record?.id;

    // Wrap response to cache on success
    const originalJson = response.json.bind(response);
    response.json = (body: unknown) => {
      if (request.__idempotencyRecordId && body) {
        const statusCode = response.statusCode;
        if (statusCode >= 200 && statusCode < 300) {
          this.svc.complete(request.__idempotencyRecordId, JSON.stringify(body)).catch(() => {});
        } else if (statusCode >= 400) {
          this.svc.fail(request.__idempotencyRecordId).catch(() => {});
        }
      }
      return originalJson(body);
    };

    return true;
  }

  private guessOperation(request: any): string {
    // Derive operation type from route path and method
    const path = request.route?.path ?? request.url ?? '';
    if (path.includes('/tasks') || path.includes('/distribution-tasks')) {
      if (path.endsWith('/publish')) return 'publish-task';
      if (path.endsWith('/cancel')) return 'cancel-task';
      if (path.endsWith('/batch') || path.includes('/batch')) return 'batch-create-tasks';
      return 'create-task';
    }
    if (path.includes('/refund')) return 'refund';
    if (path.includes('/campaigns')) {
      if (path.endsWith('/start') || path.endsWith('/approve')) return 'campaign-start';
      return 'batch-import';
    }
    return 'create-task';
  }
}
