import type { Logger } from '@nestjs/common';
import { describeError } from '@content/shared';

type PrismaLike = {
  $queryRawUnsafe: (sql: string, ...values: unknown[]) => Promise<unknown>;
  $executeRawUnsafe?: (sql: string, ...values: unknown[]) => Promise<unknown>;
};

/**
 * DB-003（PRD 7.3.2）：启动时只读结构自检。
 *
 * 铁律：应用启动路径【禁止】任何 DDL（建表 / 改表 / 建索引）。
 * 数据库结构唯一真源是 prisma/migrations，结构变更只能通过 `npm run db:migrate` 应用。
 * 本文件只做三件事：连通性检查、连接级 PRAGMA、只读结构校验（不一致即 fail-fast）。
 *
 * 历史背景：旧版曾在此执行 ensureBaseSchema/ensureResidual*Indexes 等运行时 DDL，
 * 导致「代码建表 vs 迁移建表」双真源漂移，已按 VNext 工程治理 PRD 移除。
 */

/** 启动必需的核心表（缺失说明迁移未执行） */
const REQUIRED_TABLES = [
  'AppUser',
  'ContentPackage',
  'Merchant',
  'Member',
  'OrderHeader',
  'OrderAttribution',
  'DistributionTask',
  'DistributionExecution',
  'TaskPerformanceDaily',
  'GeneratedCopy',
  'CopyPerformance',
  'OperationAuditLog',
  'RuleConfig',
  'MarketingCampaign',
  'CommunityGroup',
  'PackageSalesDaily',
  'MerchantDailyMetrics',
  'DailyMetrics'
] as const;

/** 关键列（历史上曾因半迁移库缺列造成安全隐患，如 AppUser.tokenVersion 缺失导致 JWT 吊销失效） */
const REQUIRED_COLUMNS: ReadonlyArray<{ table: string; column: string; reason: string }> = [
  {
    table: 'AppUser',
    column: 'tokenVersion',
    reason: '缺失时改密/改角色/停用无法吊销已签发 JWT'
  },
  {
    table: 'OrderHeader',
    column: 'orderTime',
    reason: '订单归因与日指标回填依赖'
  }
];

/** 关键唯一约束（缺失会破坏幂等写入） */
const REQUIRED_UNIQUE_INDEXES: ReadonlyArray<{ table: string; columns: string[]; reason: string }> =
  [
    {
      table: 'OrderAttribution',
      columns: ['orderId'],
      reason: '订单归因幂等 upsert 依赖 orderId 唯一约束'
    }
  ];

const MIGRATE_HINT =
  '数据库结构与代码期望不一致。请勿手工修库，执行: npm run db:migrate （必要时先 npm run db:backup）';

async function assertRequiredTables(prisma: PrismaLike, logger: Logger): Promise<void> {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type = 'table'`
  )) as Array<{ name: string }>;
  const existing = new Set(rows.map((r) => r.name));
  const missing = REQUIRED_TABLES.filter((t) => !existing.has(t));
  if (missing.length > 0) {
    logger.error(`缺失核心表: ${missing.join(', ')}`);
    throw new Error(`启动结构自检失败：缺失核心表 [${missing.join(', ')}]。${MIGRATE_HINT}`);
  }
}

async function assertRequiredColumns(prisma: PrismaLike, logger: Logger): Promise<void> {
  const failures: string[] = [];
  for (const { table, column, reason } of REQUIRED_COLUMNS) {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT name FROM pragma_table_info('${table}')`
    )) as Array<{ name: string }>;
    if (!rows.some((r) => r.name === column)) {
      failures.push(`${table}.${column}（${reason}）`);
    }
  }
  if (failures.length > 0) {
    logger.error(`缺失关键列: ${failures.join('; ')}`);
    throw new Error(`启动结构自检失败：缺失关键列 ${failures.join('; ')}。${MIGRATE_HINT}`);
  }
}

async function assertRequiredUniqueIndexes(prisma: PrismaLike, logger: Logger): Promise<void> {
  const failures: string[] = [];
  for (const { table, columns, reason } of REQUIRED_UNIQUE_INDEXES) {
    const indexes = (await prisma.$queryRawUnsafe(
      `SELECT name FROM pragma_index_list('${table}') WHERE "unique" = 1`
    )) as Array<{ name: string }>;
    let found = false;
    for (const idx of indexes) {
      const cols = (await prisma.$queryRawUnsafe(
        `SELECT name FROM pragma_index_info('${idx.name}')`
      )) as Array<{ name: string }>;
      const names = cols.map((c) => c.name);
      if (columns.length === names.length && columns.every((c) => names.includes(c))) {
        found = true;
        break;
      }
    }
    if (!found) {
      failures.push(`${table}(${columns.join(', ')})（${reason}）`);
    }
  }
  if (failures.length > 0) {
    logger.error(`缺失关键唯一约束: ${failures.join('; ')}`);
    throw new Error(`启动结构自检失败：缺失唯一约束 ${failures.join('; ')}。${MIGRATE_HINT}`);
  }
}

async function warnIfNoMigrationBaseline(prisma: PrismaLike, logger: Logger): Promise<void> {
  try {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS applied FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
    )) as Array<{ applied: number | bigint }>;
    const applied = Number(rows[0]?.applied ?? 0);
    if (applied === 0) {
      logger.warn('迁移登记表为空：数据库结构可能不受迁移管控，请执行 npm run db:migrate 建立基线');
    } else {
      logger.log(`迁移基线正常（已应用 ${applied} 个迁移）`);
    }
  } catch {
    logger.warn('未找到 _prisma_migrations 表：数据库尚未纳入迁移管控，请执行 npm run db:migrate');
  }
}

export async function connectPrismaOnInit(
  prisma: PrismaLike,
  logger: Logger,
  getPrismaErrorCode: (error: unknown) => string | undefined,
  resolveDevDbPath: () => { finalDbPath: string }
): Promise<void> {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    // SQLite 每个连接默认 foreign_keys OFF。不开启的话 ON DELETE CASCADE 与外键约束
    // 都是静默空操作 —— 删除任务可能孤儿化 OrderAttribution。连接级 PRAGMA 非 DDL，允许保留。
    if (typeof prisma.$executeRawUnsafe === 'function') {
      try {
        await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
      } catch (pragmaErr) {
        logger.warn(`PRAGMA foreign_keys=ON failed: ${describeError(pragmaErr)}`);
      }
      // busy_timeout：并发写（多实例 / 重算 vs 拉单）时等待写锁而非立即失败。
      // libsql 适配器把 SQLITE_BUSY 映射成 "unknown variant SocketTimeout" 抛错，
      // 曾导致刷新时批量 upsert 大面积计为「写入失败」（2026-07-29 事故：189 单）。
      try {
        await prisma.$executeRawUnsafe('PRAGMA busy_timeout = 10000');
      } catch (pragmaErr) {
        logger.warn(`PRAGMA busy_timeout failed: ${describeError(pragmaErr)}`);
      }
    }
    // 只读结构自检（DB-003）：不一致立即失败，绝不在启动路径修改结构。
    await assertRequiredTables(prisma, logger);
    await assertRequiredColumns(prisma, logger);
    await assertRequiredUniqueIndexes(prisma, logger);
    await warnIfNoMigrationBaseline(prisma, logger);
    logger.log('Database connection successful (read-only schema check passed)');
  } catch (error: unknown) {
    logger.error(`Database connection failed: ${describeError(error)}`);
    const prismaCode = getPrismaErrorCode(error);
    if (prismaCode === 'P1003') logger.error('Database file does not exist or is not accessible');
    else if (prismaCode === 'P2021')
      logger.error('Database table does not exist, migrations may be required');
    logger.error(`Database path: ${resolveDevDbPath().finalDbPath}`);
    throw error;
  }
}
