import { BadRequestException, type INestApplication, ValidationPipe } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { configureAppMiddleware } from '../src/bootstrap-middleware';
import { createDtoPipe } from '../src/common/dto-pipe';

class StrictDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

describe('DTO whitelist boundary', () => {
  it('rejects unknown fields by default instead of silently stripping them', async () => {
    const pipe = createDtoPipe(StrictDto);
    const metadata = { type: 'body' as const, metatype: StrictDto };

    await expect(
      pipe.transform({ name: 'operator', obsolete: true }, metadata)
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('still permits an explicitly opted-out compatibility pipe', async () => {
    const pipe = createDtoPipe(StrictDto, {
      whitelist: false,
      forbidNonWhitelisted: false
    });
    const metadata = { type: 'body' as const, metatype: StrictDto };

    await expect(
      pipe.transform({ name: 'operator', legacyField: 'kept' }, metadata)
    ).resolves.toMatchObject({
      name: 'operator',
      legacyField: 'kept'
    });
  });

  it('configures the Nest global pipe to reject unknown fields', async () => {
    let globalPipe: ValidationPipe | undefined;
    const app = {
      enableCors: () => undefined,
      useGlobalPipes: (pipe: ValidationPipe) => {
        globalPipe = pipe;
      }
    } as unknown as INestApplication;

    configureAppMiddleware(app);

    expect(globalPipe).toBeDefined();
    await expect(
      globalPipe!.transform(
        { name: 'operator', obsolete: true },
        { type: 'body', metatype: StrictDto }
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
