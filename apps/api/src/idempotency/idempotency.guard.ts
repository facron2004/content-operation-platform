import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
  BadRequestException,
  ConflictException,
  Logger
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { IdempotencyService } from './idempotency.service';
import { REQUIRE_IDEMPOTENCY_METADATA } from './require-idempotency.decorator';

export type IdempotencyRequest = Request & {
  __idempotentCached?: unknown;
  __idempotencyReplay?: boolean;
  __idempotencyRecordId?: string;
};

type ReflectTarget = ReturnType<ExecutionContext['getHandler']>;

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
 *   @RequireIdempotency('create-task')
 *   @Post()
 *   async create(@Body() body: CreateDto) { ... }
 *
 * When Idempotency-Key header is present:
 *   - First request: executes normally, caches result
 *   - Same key + same body: returns cached result
 *   - Same key + different body: 409 Conflict
 *   - Different key: treated as new request
 *   - No header on a required route: returns 400
 *   - No header on an optional route: passes through for compatibility
 */
@Injectable()
export class IdempotencyGuard implements CanActivate {
  private readonly logger = new Logger(IdempotencyGuard.name);

  constructor(
    @Inject(IdempotencyService) private readonly svc: IdempotencyService,
    @Inject(Reflector) private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IdempotencyRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const method = request.method?.toUpperCase();

    // Only guard mutating methods
    if (!['POST', 'PUT', 'PATCH'].includes(method)) return true;

    const requiredOperation = this.getRequiredOperation(context);
    const idempotencyKey = this.readHeader(request, IDEMPOTENCY_KEY_HEADER);
    if (!idempotencyKey) {
      if (requiredOperation) {
        throw new BadRequestException(
          `缺少 ${IDEMPOTENCY_KEY_HEADER}：${requiredOperation} 必须提供业务意图幂等键`
        );
      }
      return true;
    }

    const operationType =
      requiredOperation ??
      this.readHeader(request, IDEMPOTENCY_OP_HEADER) ??
      this.guessOperation(request);
    const requestHash = this.svc.hashRequest(request.body);

    // Look for existing record
    const existing = await this.svc.findRecord(idempotencyKey, operationType);
    if (existing) {
      return this.handleExisting(request, response, existing, requestHash);
    }

    // Create new record
    const record = await this.svc.tryCreate(idempotencyKey, operationType, requestHash);
    if (!record) {
      // Race: another request created the record first
      const winner = await this.svc.findRecord(idempotencyKey, operationType);
      if (!winner) throw new ConflictException('幂等记录创建冲突，请使用相同幂等键重试');
      return this.handleExisting(request, response, winner, requestHash);
    }

    // Store record id on request so the response interceptor can update it
    request.__idempotencyRecordId = record.id;

    this.wrapResponse(response, request);
    return true;
  }

  private async handleExisting(
    request: IdempotencyRequest,
    response: Response,
    existing: {
      id: string;
      requestHash: string;
      status: 'pending' | 'completed' | 'failed';
      responseData: string | null;
    },
    requestHash: string
  ): Promise<boolean> {
    if (existing.requestHash !== requestHash) {
      throw new ConflictException('幂等键冲突：相同 Idempotency-Key 但请求内容不同');
    }
    if (existing.status === 'completed') {
      if (existing.responseData == null) {
        throw new ConflictException('幂等记录缺少已完成响应，请使用新的幂等键重试');
      }
      try {
        request.__idempotentCached = JSON.parse(existing.responseData) as unknown;
        request.__idempotencyReplay = true;
      } catch {
        throw new ConflictException('幂等记录响应无效，请使用新的幂等键重试');
      }
      return true;
    }
    if (existing.status === 'pending') {
      throw new ConflictException('相同幂等请求正在处理中，请稍后重试');
    }

    // Failed records may be retried with the same key. Reuse the record so a
    // successful retry becomes the cached response for later requests.
    const acquired = await this.svc.tryAcquireFailed(existing.id);
    if (!acquired) {
      throw new ConflictException('相同幂等请求正在重试中，请稍后重试');
    }
    request.__idempotencyRecordId = existing.id;
    this.wrapResponse(response, request);
    return true;
  }

  private getRequiredOperation(context: ExecutionContext): IdempotentOperation | undefined {
    const executionContext = context as ExecutionContext & {
      getHandler?: ExecutionContext['getHandler'];
      getClass?: ExecutionContext['getClass'];
    };
    const targets = [executionContext.getHandler?.(), executionContext.getClass?.()].filter(
      (target): target is ReflectTarget => typeof target === 'function'
    );
    if (!targets.length) return undefined;
    return this.reflector.getAllAndOverride<IdempotentOperation>(
      REQUIRE_IDEMPOTENCY_METADATA,
      targets
    );
  }

  private wrapResponse(response: Response, request: IdempotencyRequest): void {
    // Wrap response to cache on success
    const originalJson = response.json.bind(response);
    response.json = (body: unknown) => {
      if (request.__idempotencyRecordId && body !== undefined) {
        const recordId = request.__idempotencyRecordId;
        const statusCode = response.statusCode;
        if (statusCode >= 200 && statusCode < 300) {
          void this.svc
            .complete(recordId, JSON.stringify(body))
            .catch((error: unknown) =>
              this.logPersistenceFailure(recordId, 'completed', statusCode, error)
            );
        } else if (statusCode >= 400) {
          void this.svc
            .fail(recordId)
            .catch((error: unknown) =>
              this.logPersistenceFailure(recordId, 'failed', statusCode, error)
            );
        }
      }
      return originalJson(body);
    };
  }

  private logPersistenceFailure(
    recordId: string,
    targetStatus: 'completed' | 'failed',
    statusCode: number,
    error: unknown
  ): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(
      `Failed to persist idempotency record ${recordId} as ${targetStatus} after HTTP ${statusCode}: ${message}`,
      error instanceof Error ? error.stack : undefined
    );
  }

  private readHeader(request: Request, name: string): string | undefined {
    const value = request.headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }

  private guessOperation(request: Request): string {
    // Derive operation type from route path and method
    const path = (
      request.originalUrl ??
      [request.baseUrl, request.route?.path].filter(Boolean).join('') ??
      request.url ??
      ''
    ).split('?')[0];
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
