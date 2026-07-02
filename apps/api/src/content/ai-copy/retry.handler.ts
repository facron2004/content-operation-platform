import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS, exponentialBackoff } from '../../domain/utils';

export class RetryHandler {
  private readonly logger = new Logger(RetryHandler.name);
  private readonly timeoutMs: number;
  private readonly maxRetries = 2;

  constructor(timeoutMs?: number) {
    this.timeoutMs =
      timeoutMs ?? Number.parseInt(process.env.AI_GENERATE_TIMEOUT_MS ?? '30000', 10);
  }

  async executeWithRetry<T>(
    operation: (controller: AbortController) => Promise<T>,
    packageId: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const result = await operation(controller);
        clearTimeout(timeoutId);
        return result;
      } catch (error: unknown) {
        clearTimeout(timeoutId);
        const err = error instanceof Error ? error : new Error(String(error));

        if (err.name === 'AbortError' || err.message?.includes('aborted')) {
          this.logger.warn(
            `AI copy generation timed out after ${this.timeoutMs}ms for package ${packageId}`
          );
          throw new ServiceUnavailableException(
            `AI文案生成超时（${Math.round(this.timeoutMs / 1000)}s），请稍后重试或减少生成数量`
          );
        }

        lastError = err;

        const statusCode =
          err instanceof Error && 'status' in err && typeof err.status === 'number'
            ? err.status
            : undefined;
        const isRetryable = statusCode === undefined || statusCode >= 500;

        if (attempt < this.maxRetries && isRetryable) {
          const delayMs = exponentialBackoff(attempt, RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS);
          this.logger.warn(
            `AI copy attempt ${attempt + 1} failed (${err.message}), retrying in ${delayMs}ms...`
          );
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }

        throw err;
      }
    }

    throw lastError ?? new ServiceUnavailableException('AI文案生成失败，请稍后重试');
  }
}
