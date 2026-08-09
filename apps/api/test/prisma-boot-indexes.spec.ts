import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@libsql/client';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { connectPrismaOnInit } from '../src/prisma/prisma-connect';

describe('boot + schema index hygiene (DB-003)', () => {
  it('startup schema check performs no runtime DDL', async () => {
    const requiredTables = [
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
    ];
    const query = vi.fn(async (sql: string) => {
      if (sql === 'SELECT 1') return [{ result: 1 }];
      if (sql.includes('sqlite_master')) return requiredTables.map((name) => ({ name }));
      if (sql.includes("pragma_table_info('AppUser')")) return [{ name: 'tokenVersion' }];
      if (sql.includes("pragma_table_info('OrderHeader')")) return [{ name: 'orderTime' }];
      if (sql.includes("pragma_index_list('OrderAttribution')")) {
        return [{ name: 'OrderAttribution_orderId_key' }];
      }
      if (sql.includes("pragma_index_info('OrderAttribution_orderId_key')")) {
        return [{ name: 'orderId' }];
      }
      if (sql.includes('_prisma_migrations')) return [{ applied: 1 }];
      throw new Error(`Unexpected startup query: ${sql}`);
    });
    const execute = vi.fn().mockResolvedValue(undefined);
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

    await connectPrismaOnInit(
      { $queryRawUnsafe: query, $executeRawUnsafe: execute },
      logger as never,
      () => undefined,
      () => ({ finalDbPath: 'test.db' })
    );

    const writes = execute.mock.calls.map(([sql]) => String(sql));
    expect(writes).toEqual(['PRAGMA foreign_keys = ON', 'PRAGMA busy_timeout = 10000']);
    expect(writes.some((sql) => /CREATE|ALTER|DROP/i.test(sql))).toBe(false);
  });

  it('migration materializes the key compound indexes used by heavy queries', async () => {
    const root = join(__dirname, '..', '..', '..');
    const tempDir = join(root, '.tmp-test-db');
    const databasePath = join(tempDir, 'prisma-indexes-migration.db');
    mkdirSync(tempDir, { recursive: true });
    rmSync(databasePath, { force: true });
    const client = createClient({ url: `file:${databasePath.replaceAll('\\', '/')}` });
    try {
      const migration = readFileSync(
        join(__dirname, '..', '..', '..', 'prisma', 'migrations', '0001_init', 'migration.sql'),
        'utf8'
      );
      await client.executeMultiple(migration);
      const result = await client.execute(`SELECT name FROM sqlite_master WHERE type = 'index'`);
      const names = new Set(result.rows.map((row) => String(row.name)));
      expect([...names]).toEqual(
        expect.arrayContaining([
          'OrderAttribution_taskId_attributedAt_idx',
          'OrderHeader_packageId_orderTime_idx',
          'OrderHeader_refundTime_idx',
          'OrderHeader_verifyTime_idx',
          'OrderHeader_memberId_packageId_orderTime_idx',
          'DistributionExecution_createdAt_idx',
          'DistributionTask_createdAt_idx',
          'DistributionTask_updatedAt_idx',
          'TaskPerformanceDaily_date_idx',
          'CopyPerformance_createdAt_idx'
        ])
      );
    } finally {
      await client.close();
    }
  });
});
