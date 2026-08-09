import { describe, expect, it, vi } from 'vitest';
import { UserQueryService } from '../src/user-access/application/user-query.service';

describe('UserQueryService tenant-scoped reads', () => {
  it('keeps user list count and page queries inside the supplied tenant', async () => {
    const queryRawUnsafe = vi.fn(async (sql: string, ..._params: unknown[]) => {
      if (sql.includes('COUNT(*)')) return [{ count: 0 }];
      return [];
    });
    const service = new UserQueryService({ $queryRawUnsafe: queryRawUnsafe } as never);

    await expect(service.list('tenant-a', 1, 20, undefined)).resolves.toMatchObject({
      data: [],
      total: 0,
      page: 1,
      pageSize: 20
    });

    expect(queryRawUnsafe).toHaveBeenCalledTimes(2);
    for (const [sql, ...params] of queryRawUnsafe.mock.calls) {
      expect(sql).toContain('WHERE "tenantId" = ?');
      expect(params[0]).toBe('tenant-a');
    }
  });
});
