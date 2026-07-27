import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { describeError } from '@content/shared';
import { getPrismaErrorCode, resolveDevDbPath } from './prisma-path';
import { connectPrismaOnInit } from './prisma-connect';
import { moneyFenExtension } from './money-fen-extension';
export { prismaJsonReplacer } from './prisma-path';
const BOOT_LOGGER = new Logger('PrismaService');
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);
  constructor() {
    // Priority 1: Use DATABASE_URL env var directly (e.g., CI sets absolute path)
    const envUrl = process.env.DATABASE_URL;
    if (envUrl) {
      // Resolve relative file:// URLs to absolute paths for libSQL compatibility (especially Windows)
      const { finalDbPath, exists } = resolveDevDbPath();
      if (exists) {
        const n = finalDbPath.replace(/\\/g, '/');
        super({
          adapter: new PrismaLibSQL({ url: /^[a-zA-Z]:\//.test(n) ? `file:///${n}` : `file:${n}` })
        });
      } else {
        super({
          adapter: new PrismaLibSQL({ url: envUrl })
        });
      }
      return this.$extends(moneyFenExtension) as unknown as PrismaService;
    }

    // Priority 2: Scan filesystem for dev.db
    const { finalDbPath, exists } = resolveDevDbPath();
    try {
      require('fs').mkdirSync(require('path').dirname(finalDbPath), { recursive: true });
    } catch {
      // 目录已存在或无权限时忽略；后续连接失败会有明确报错
    }
    if (!exists)
      BOOT_LOGGER.warn(`dev.db not found at ${finalDbPath}. libsql will create it on first query.`);
    const n = finalDbPath.replace(/\\/g, '/');
    super({
      adapter: new PrismaLibSQL({ url: /^[a-zA-Z]:\//.test(n) ? `file:///${n}` : `file:${n}` })
    });
    // Phase 3 双写：所有 ORM 写路径自动从 Float 金额字段派生 *Fen（PRD §7.4）。
    return this.$extends(moneyFenExtension) as unknown as PrismaService;
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
