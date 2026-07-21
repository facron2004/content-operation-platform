import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { describeError } from '@content/shared';
import { getPrismaErrorCode, resolveDevDbPath } from './prisma-path';
import { connectPrismaOnInit } from './prisma-connect';
export { prismaJsonReplacer } from './prisma-path';
const BOOT_LOGGER = new Logger('PrismaService');
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);
  constructor() {
    // Priority 1: Use DATABASE_URL env var directly (e.g., CI sets absolute path)
    const envUrl = process.env.DATABASE_URL;
    if (envUrl) {
      super({
        adapter: new PrismaLibSQL({ url: envUrl })
      });
      return;
    }

    // Priority 2: Scan filesystem for dev.db
    const { finalDbPath, exists } = resolveDevDbPath();
    if (!exists)
      BOOT_LOGGER.warn(`dev.db not found at ${finalDbPath}. libsql will create it on first query.`);
    const n = finalDbPath.replace(/\\/g, '/');
    super({
      adapter: new PrismaLibSQL({ url: /^[a-zA-Z]:\//.test(n) ? `file:///${n}` : `file:${n}` })
    });
  }
  async onModuleInit() {
    await connectPrismaOnInit(this, this.logger, getPrismaErrorCode, resolveDevDbPath);
  }
  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch (e) {
      this.logger.warn(`disconnect failed: ${describeError(e)}`);
    }
  }
}
