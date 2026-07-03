import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { describeError } from '@content/shared';

/** 提取 Prisma 已知错误码,避免 unsafe cast;非 Prisma 错误返回 undefined。 */
function getPrismaErrorCode(error: unknown): string | undefined {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
}

/** 解析 dev.db 路径:exe 同级 > cwd > cwd(回退)。
 * 返回多值避免外部重复 existsSync 调用。 */
function resolveDevDbPath() {
  const exeDir = dirname(process.execPath);
  const exeDbPath = join(exeDir, 'prisma', 'dev.db');
  const cwdDbPath = join(process.cwd(), 'prisma', 'dev.db');
  const finalDbPath = existsSync(exeDbPath)
    ? exeDbPath
    : existsSync(cwdDbPath)
      ? cwdDbPath
      : cwdDbPath;
  return { exeDbPath, cwdDbPath, finalDbPath, exists: existsSync(finalDbPath) };
}

// 构造期内打日志用(super() 之前 this.logger 不可用)
// 其他生命周期内的日志走实例字段 this.logger,以便测试和 NestJS DI 替换。
const BOOT_LOGGER = new Logger('PrismaService');

// 动态加载 Prisma 客户端以支持 pkg 打包
function loadPrismaClient() {
  try {
    // 尝试从 exe 所在目录的 node_modules 加载（用于 pkg 打包后的 exe）
    const exeDir = dirname(process.execPath);
    const externalPath = join(exeDir, 'node_modules', '@prisma', 'client');

    // 如果不存在，回退到 process.cwd()
    const finalPath = existsSync(externalPath)
      ? externalPath
      : join(process.cwd(), 'node_modules', '@prisma', 'client');

    return require(finalPath).PrismaClient;
  } catch {
    // 回退到正常的 import（用于开发环境）
    return require('@prisma/client').PrismaClient;
  }
}

const PrismaClient = loadPrismaClient();

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // 优先使用环境变量中的 DATABASE_URL
    if (process.env.DATABASE_URL) {
      super();
    } else {
      // 回退逻辑：统一查找 prisma/dev.db
      const { exeDbPath, cwdDbPath, finalDbPath, exists } = resolveDevDbPath();
      if (!exists) {
        // 不抛错:Prisma 会在首次查询时给出更明确的错误,这里只打 warn 避免掩盖真实根因
        // 用模块级 BOOT_LOGGER 而非 this.logger,因为 super() 还未执行
        BOOT_LOGGER.warn(
          `dev.db not found at ${exeDbPath} or ${cwdDbPath}. Prisma will surface the connection error on first query.`
        );
      }
      const databaseUrl = `file:${finalDbPath}`;

      super({
        datasources: {
          db: {
            url: databaseUrl
          }
        }
      });
    }
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connection successful');

      // 启动时自动迁移：给已存在的表补齐新增字段
      await this.migrateAddColumns();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Database connection failed: ${err.message}`);

      const prismaCode = getPrismaErrorCode(error);
      if (prismaCode === 'P1003') {
        this.logger.error('Database file does not exist or is not accessible');
      } else if (prismaCode === 'P2021') {
        this.logger.error('Database table does not exist, migrations may be required');
      }

      const { finalDbPath, exists } = resolveDevDbPath();
      this.logger.error(`Database path: ${finalDbPath}`);
      this.logger.error(`File exists: ${exists}`);

      throw error;
    }
  }

  /**
   * 检测并补齐 ContentPackage 表中可能缺失的列（兼容旧数据库）
   */
  private async migrateAddColumns(): Promise<void> {
    const columns: Array<{ name: string; type: string }> = [
      { name: 'temporarySalePrice', type: 'REAL' },
      { name: 'detailSummary', type: 'TEXT' },
      { name: 'saleStatus', type: 'TEXT' }
    ];

    try {
      const existingColumns = (await this.$queryRawUnsafe(
        'PRAGMA table_info("ContentPackage")'
      )) as Array<{ name: string }>;
      const existingNames = new Set(existingColumns.map((c: { name: string }) => c.name));

      for (const col of columns) {
        if (!existingNames.has(col.name)) {
          await this.$executeRawUnsafe(
            `ALTER TABLE "ContentPackage" ADD COLUMN "${col.name}" ${col.type}`
          );
          this.logger.log(`Added column "ContentPackage"."${col.name}"`);
        }
      }
    } catch (err: unknown) {
      // 表可能还不存在（首次启动），忽略错误
      this.logger.warn(`Skipping column migration: ${describeError(err)}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
