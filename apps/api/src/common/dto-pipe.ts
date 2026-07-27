import { BadRequestException, type PipeTransform, type Type } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';

/**
 * Explicit DTO pipe that does not rely on TypeScript `design:paramtypes`.
 *
 * Nest's global ValidationPipe skips validation when emitDecoratorMetadata is
 * unavailable (tsx/esbuild/vitest default transforms). Passing the DTO class
 * here keeps 400s working in dev, tests, and production dist.
 */
export function createDtoPipe<T extends object>(
  DtoClass: Type<T>,
  options?: { whitelist?: boolean; forbidNonWhitelisted?: boolean }
): PipeTransform {
  const whitelist = options?.whitelist ?? true;
  const forbidNonWhitelisted = options?.forbidNonWhitelisted ?? false;

  return {
    async transform(value: unknown): Promise<T> {
      const instance = plainToInstance(DtoClass, value ?? {});
      const errors = await validate(instance as object, {
        whitelist,
        forbidNonWhitelisted,
        // Skip missing properties only when marked @IsOptional — required fields still fail.
        skipMissingProperties: false
      });
      if (errors.length > 0) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: flattenValidationErrors(errors)
        });
      }
      return instance;
    }
  };
}

function flattenValidationErrors(
  errors: ValidationError[],
  parent = ''
): Array<{ property: string; constraints: string[] }> {
  const out: Array<{ property: string; constraints: string[] }> = [];
  for (const err of errors) {
    const path = parent ? `${parent}.${err.property}` : err.property;
    if (err.constraints) {
      out.push({ property: path, constraints: Object.values(err.constraints) });
    }
    if (err.children?.length) {
      out.push(...flattenValidationErrors(err.children, path));
    }
  }
  return out;
}
