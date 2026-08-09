import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor
} from '@nestjs/common';
import { of, type Observable } from 'rxjs';
import type { IdempotencyRequest } from './idempotency.guard';

/** Replays the response selected by IdempotencyGuard without invoking the handler again. */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  intercept<T>(context: ExecutionContext, next: CallHandler<T>): Observable<T> {
    const request = context.switchToHttp().getRequest<IdempotencyRequest>();
    if (request.__idempotencyReplay) {
      return of(request.__idempotentCached as T);
    }
    return next.handle();
  }
}
