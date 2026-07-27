import { describe, expect, it } from 'vitest';

/**
 * VNext 工程治理（PRD 7.3.2 DB-003）后的索引卫生检查：
 * - 结构唯一真源 = prisma/schema.prisma + prisma/migrations
 * - prisma-connect.ts 必须是只读自检，禁止任何运行时 DDL
 * 旧断言（要求 prisma-connect 内含 CREATE INDEX）已随运行时 DDL 移除而反转。
 */
describe('boot + schema index hygiene (residual #50/#51/#54, VNext DB-003)', () => {
  const readConnect = async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    return fs.readFile(path.join(__dirname, '..', 'src', 'prisma', 'prisma-connect.ts'), 'utf8');
  };
  const readSchema = async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    return fs.readFile(path.join(__dirname, '..', '..', '..', 'prisma', 'schema.prisma'), 'utf8');
  };
  const readMigration = async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    return fs.readFile(
      path.join(__dirname, '..', '..', '..', 'prisma', 'migrations', '0001_init', 'migration.sql'),
      'utf8'
    );
  };

  it('DB-003: prisma-connect contains NO runtime DDL (no CREATE/ALTER/DROP)', async () => {
    const src = await readConnect();
    expect(src).not.toMatch(/CREATE\s+TABLE/i);
    expect(src).not.toMatch(/CREATE\s+(UNIQUE\s+)?INDEX/i);
    expect(src).not.toMatch(/ALTER\s+TABLE/i);
    expect(src).not.toMatch(/DROP\s+(TABLE|INDEX)/i);
    // 只读自检必须存在
    expect(src).toContain('assertRequiredTables');
    expect(src).toContain('assertRequiredColumns');
    expect(src).toContain('assertRequiredUniqueIndexes');
  });

  it('schema declares OA task+attributedAt and OH packageId+orderTime', async () => {
    const src = await readSchema();
    expect(src).toMatch(/@@index\(\[taskId,\s*attributedAt\]\)/);
    expect(src).toMatch(/@@index\(\[packageId,\s*orderTime\]\)/);
  });

  it('migration creates OA task+attributedAt and OH packageId+orderTime indexes', async () => {
    const sql = await readMigration();
    expect(sql).toContain('OrderAttribution_taskId_attributedAt_idx');
    expect(sql).toContain('OrderHeader_packageId_orderTime_idx');
  });

  it('schema declares DistributionExecution createdAt + TaskPerformanceDaily date indexes', async () => {
    const src = await readSchema();
    const deStart = src.indexOf('model DistributionExecution');
    const deEnd = src.indexOf('model TrackingVisit', deStart);
    expect(deStart).toBeGreaterThanOrEqual(0);
    expect(deEnd).toBeGreaterThan(deStart);
    expect(src.slice(deStart, deEnd)).toMatch(/@@index\(\[createdAt\]\)/);
    const tpdStart = src.indexOf('model TaskPerformanceDaily');
    const tpdEnd = src.indexOf('model OperationAuditLog', tpdStart);
    expect(tpdStart).toBeGreaterThanOrEqual(0);
    expect(tpdEnd).toBeGreaterThan(tpdStart);
    expect(src.slice(tpdStart, tpdEnd)).toMatch(/@@index\(\[date\]\)/);
  });

  it('migration creates DE createdAt + TPD date indexes', async () => {
    const sql = await readMigration();
    expect(sql).toContain('DistributionExecution_createdAt_idx');
    expect(sql).toContain('TaskPerformanceDaily_date_idx');
  });

  it('residual #54: schema declares OH refund/verify + DT time + CP createdAt indexes', async () => {
    const src = await readSchema();

    const ohStart = src.indexOf('model OrderHeader');
    const ohEnd = src.indexOf('model Member', ohStart);
    const ohBlock = src.slice(ohStart, ohEnd);
    expect(ohBlock).toMatch(/@@index\(\[refundTime\]\)/);
    expect(ohBlock).toMatch(/@@index\(\[verifyTime\]\)/);
    expect(ohBlock).toMatch(/@@index\(\[memberId,\s*packageId,\s*orderTime\]\)/);

    const dtStart = src.indexOf('model DistributionTask');
    const dtEnd = src.indexOf('model DistributionExecution', dtStart);
    const dtBlock = src.slice(dtStart, dtEnd);
    expect(dtBlock).toMatch(/@@index\(\[createdAt\]\)/);
    expect(dtBlock).toMatch(/@@index\(\[updatedAt\]\)/);

    const cpStart = src.indexOf('model CopyPerformance');
    const cpEnd = src.indexOf('model JeeSiteInventoryDailySnapshot', cpStart);
    expect(src.slice(cpStart, cpEnd)).toMatch(/@@index\(\[createdAt\]\)/);
  });

  it('residual #54: migration creates OH refund/verify + DT time + CP createdAt indexes', async () => {
    const sql = await readMigration();
    expect(sql).toContain('OrderHeader_refundTime_idx');
    expect(sql).toContain('OrderHeader_verifyTime_idx');
    expect(sql).toContain('OrderHeader_memberId_packageId_orderTime_idx');
    expect(sql).toContain('DistributionTask_createdAt_idx');
    expect(sql).toContain('DistributionTask_updatedAt_idx');
    expect(sql).toContain('CopyPerformance_createdAt_idx');
  });
});
