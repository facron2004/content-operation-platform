import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

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
  constructor() {
    // 优先使用环境变量中的 DATABASE_URL
    if (process.env.DATABASE_URL) {
      super();
    } else {
      // 回退到 pkg 打包环境的逻辑
      const exeDir = dirname(process.execPath);
      const dbPath = join(exeDir, 'dev.db');
      const finalDbPath = existsSync(dbPath) ? dbPath : join(process.cwd(), 'dev.db');
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
      console.log('✅ 数据库连接成功');

      // 启动时自动迁移：给已存在的表补齐新增字段
      await this.migrateAddColumns();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('\n❌ 数据库连接失败:');
      console.error(`   错误信息: ${err.message}`);

      if ((error as { code?: string }).code === 'P1003') {
        console.error('   数据库文件不存在或无法访问');
      } else if ((error as { code?: string }).code === 'P2021') {
        console.error('   数据库表不存在，可能需要运行迁移');
      }

      const exeDir = dirname(process.execPath);
      const dbPath = join(exeDir, 'dev.db');
      const finalDbPath = existsSync(dbPath) ? dbPath : join(process.cwd(), 'dev.db');
      console.error(`   数据库路径: ${finalDbPath}`);
      console.error(`   文件存在: ${existsSync(finalDbPath)}\n`);

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
          console.log(`[migrate] Added column "ContentPackage"."${col.name}"`);
        }
      }
    } catch (err: unknown) {
      // 表可能还不存在（首次启动），忽略错误
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[migrate] Skipping column migration:', message);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
