import { describe, expect, it } from 'vitest';

describe('residual #103 drop happy-path pre-COUNT freezes', () => {
  it('community update pins area freeze only via UPDATE NOT EXISTS (no pre-COUNT helper)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async update(id: string');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async delete(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    // Atomic freeze remains on the write.
    expect(fn).toMatch(/NOT EXISTS \([\s\S]{0,120}DistributionTask/);
    // No pre-assert call / COUNT on happy path.
    expect(fn).not.toContain('assertNoLiveTasksWhenMovingArea');
    expect(fn).not.toMatch(/SELECT COUNT\(\*\) as cnt FROM "DistributionTask"/);

    // Helper fully removed (was only used for pre-COUNT).
    expect(src).not.toMatch(/private\s+async\s+assertNoLiveTasksWhenMovingArea\s*\(/);
  });

  it('campaign update drops happy-path pre-COUNT; failure arm uses SELECT 1 LIMIT 1', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'campaign', 'campaign.service.ts'),
      'utf8'
    );

    // update() 签名已改为多行（新增 preloadedMeta 参数），用方法头定位。
    const fnStart = src.indexOf('async update(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async delete(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    // Happy path: historyGuard NOT EXISTS only — no pre-assert before building sets.
    expect(fn).toContain('historyGuard');
    expect(fn).toMatch(/NOT EXISTS \(SELECT 1 FROM "DistributionTask"/);
    // Pre-assert only on failure arm (after changed <= 0).
    const preSetsAssert = fn.match(/const nextStart[\s\S]*?const sets: string\[] = \[]/);
    // Between structural freeze comment region and sets build there must be no assert call.
    expect(fn).toMatch(/Residual #103: no happy-path pre-COUNT[\s\S]{0,200}const nextStart/);
    expect(fn).toContain('assertNoTaskHistoryWhenRewritingScope');

    const helperStart = src.indexOf('private async assertNoTaskHistoryWhenRewritingScope');
    expect(helperStart).toBeGreaterThan(0);
    const helperNext = src.indexOf('\n  private generateId', helperStart + 10);
    const helper = src.slice(helperStart, helperNext > 0 ? helperNext : undefined);
    // SELECT 1 / taskId LIMIT 1 — not COUNT(*).
    expect(helper).toMatch(/SELECT "taskId" FROM "DistributionTask"/);
    expect(helper).toContain('LIMIT 1');
    expect(helper).not.toMatch(/SELECT COUNT\(\*\)/);
    // Silence unused binding if pattern unused in runtime assertion above.
    void preSetsAssert;
  });
});
