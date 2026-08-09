import { SetMetadata } from '@nestjs/common';
import type { IdempotentOperation } from './idempotency.guard';

export const REQUIRE_IDEMPOTENCY_METADATA = 'idempotency:required-operation';

/** Marks a route as requiring a business-intent Idempotency-Key. */
export const RequireIdempotency = (operation: IdempotentOperation) =>
  SetMetadata(REQUIRE_IDEMPOTENCY_METADATA, operation);
