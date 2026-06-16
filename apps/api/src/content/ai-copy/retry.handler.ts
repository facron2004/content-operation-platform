import { Logger, ServiceUnavailableException } from '@nestjs/common';

export class RetryHandler {
  private readonly logger = new Logger(RetryHandler.name);
  private readonly timeoutMs: number;
  private readonly maxRetries = 2;

  constructor(timeoutMs?: number) {
    this.timeoutMs = timeoutMs ?? parseInt(process.env.AI_GENERATE_TIMEOUT_MS ?? '30000', 10);
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

        const statusCode = (error as { status?: number })?.status;
        const isRetryable = !statusCode || statusCode >= 500;

        if (attempt < this.maxRetries && isRetryable) {
          const delayMs = 1000 * Math.pow(2, attempt);
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
