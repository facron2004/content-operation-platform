import { describe, expect, it, vi } from 'vitest';
import { beijingDayRangeSqlite, sqlDatetimeExclusiveRange } from '../src/common/sqlite-datetime';
import { recomputeDailyMetricsRange, recomputePackageSalesAmountRange } from '../src/money';
import type { PackageSalesAmountPrisma } from '../src/money/package-sales-amount';

describe('residual #80 exclusive paidTime bounds on recompute paths', () => {
  it('recomputeDailyMetricsRange filters paidTime with exclusive half-open bounds', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(1) // DELETE
      .mockResolvedValueOnce(1); // INSERT
    await recomputeDailyMetricsRange({ $executeRawUnsafe: execute }, '2026-07-01', '2026-07-03');
    const insertSql = String(execute.mock.calls[1][0]);
    expect(insertSql).toContain(sqlDatetimeExclusiveRange('oh."paidTime"'));
    expect(insertSql).not.toMatch(/sqlBeijingDate.*paidTime.*>=/);
    // sqlBeijingDate only for SELECT/GROUP BY day keys.
    expect(insertSql).toContain('date(datetime(replace(replace(oh."paidTime"');
    const expectedStart = beijingDayRangeSqlite('2026-07-01').start;
    const expectedEnd = beijingDayRangeSqlite('2026-07-03').end;
    // params: now, paidStart, paidEnd
    expect(execute.mock.calls[1][2]).toBe(expectedStart);
    expect(execute.mock.calls[1][3]).toBe(expectedEnd);
  });

  it('recomputePackageSalesAmountRange uses exclusive paidTime on insert + coverage', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(1) // zero
      .mockResolvedValueOnce(2); // upsert
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ gmv: 50 }])
      .mockResolvedValueOnce([{ gmv: 50 }]);
    const transaction = vi.fn(async (fn: (tx: PackageSalesAmountPrisma) => Promise<unknown>) =>
      fn({ $executeRawUnsafe: execute, $queryRawUnsafe: query })
    ) as unknown as NonNullable<PackageSalesAmountPrisma['$transaction']>;
    await recomputePackageSalesAmountRange(
      { $executeRawUnsafe: execute, $queryRawUnsafe: query, $transaction: transaction },
      '2026-07-01',
      '2026-07-02'
    );
    const insertSql = String(execute.mock.calls[1][0]);
    expect(insertSql).toContain(sqlDatetimeExclusiveRange('oh."paidTime"'));
    expect(insertSql).not.toMatch(/\$\{sqlBeijingDate\('oh\."paidTime"'\)\} >= \?/);
    const joinableSql = String(query.mock.calls[0][0]);
    const totalSql = String(query.mock.calls[1][0]);
    expect(joinableSql).toContain(sqlDatetimeExclusiveRange('"paidTime"'));
    expect(totalSql).toContain(sqlDatetimeExclusiveRange('"paidTime"'));
    const expectedStart = beijingDayRangeSqlite('2026-07-01').start;
    const expectedEnd = beijingDayRangeSqlite('2026-07-02').end;
    // insert params: now, now, now, paidStart, paidEnd
    expect(execute.mock.calls[1][4]).toBe(expectedStart);
    expect(execute.mock.calls[1][5]).toBe(expectedEnd);
    expect(query.mock.calls[0][1]).toBe(expectedStart);
    expect(query.mock.calls[0][2]).toBe(expectedEnd);
  });

  it('MERCHANT_DAILY_METRICS_INSERT_SQL uses exclusive paidTime filter', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant-sales', 'merchant-sales-query.ts'),
      'utf8'
    );
    expect(src).toContain('sqlDatetimeExclusiveRange(\'oh."paidTime"\')');
    expect(src).not.toMatch(/sqlBeijingDate\('oh\."paidTime"'\)\} >= \?/);
    expect(src).toContain('paidStart');
    expect(src).toContain('paidEnd');
  });
});

describe('residual #80 interactive list exclusive createdAt/orderTime', () => {
  it('task/community/audit/attribution/dashboard use sqlDatetimeExclusiveRange in WHERE', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const files = [
      ['distribution-task', 'distribution-task-query.ts'],
      ['community', 'community.service.ts'],
      ['audit-log', 'audit-log.service.ts'],
      ['attribution', 'attribution.service.ts'],
      ['content', 'dashboard.service.ts']
    ];
    for (const parts of files) {
      const src = await fs.readFile(path.join(__dirname, '..', 'src', ...parts), 'utf8');
      expect(src, parts.join('/')).toContain('sqlDatetimeExclusiveRange');
      expect(src, parts.join('/')).toContain('beijingDayRangeSqlite');
      // No inclusive sqlBeijingDate day-key filters left on free-form timestamps.
      expect(src, parts.join('/')).not.toMatch(/\$\{sqlBeijingDate\([^)]+\)\} >= \?/);
    }
  });
});

describe('residual #80 merchant updateSkuCounts batch GROUP BY', () => {
  it('updateSkuCounts batches COUNT then bulk write (no correlated subquery)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'merchant', 'merchant-address-updater.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('async function updateSkuCounts');
    expect(fnStart).toBeGreaterThan(0);
    const fn = src.slice(fnStart);
    expect(fn).toContain('GROUP BY "merchantId"');
    expect(fn).toContain('COUNT(*) AS "totalSku"');
    expect(fn).not.toMatch(
      /SELECT COUNT\(\*\) FROM "ContentPackage" WHERE "ContentPackage"\."merchantId" = "Merchant"\."merchantId"/
    );
  });
});

describe('residual #80 residual interactive page Max 100', () => {
  it('content/attribution/rule-config/user list DTOs cap page at 100', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const files = [
      ['content', 'content.dto.ts'],
      ['content', 'rule-config.dto.ts'],
      ['attribution', 'attribution.controller.ts'],
      ['user-access', 'user.controller.ts']
    ];
    for (const parts of files) {
      const src = await fs.readFile(path.join(__dirname, '..', 'src', ...parts), 'utf8');
      expect(src, parts.join('/')).toMatch(/@Max\(100\)[\s\S]{0,80}page/);
      expect(src, parts.join('/')).not.toMatch(/@Max\(500\)[\s\S]{0,40}page[^\w]/);
    }
  });

  it('attribution unmatched clamps page with max 100', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'attribution', 'attribution.service.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('async getUnmatchedOrders');
    const fn = src.slice(fnStart, fnStart + 800);
    expect(fn).toMatch(/clampListPage\(page,\s*100\)/);
  });
});
