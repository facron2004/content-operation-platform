import { describe, expect, it } from 'vitest';

describe('residual #96 batchCreate bulk rollback + attribution UNIQUE binary-split', () => {
  it('batchCreate failure path uses DELETE … IN (…) (not N serial DELETEs)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(
        __dirname,
        '..',
        'src',
        'distribution-task',
        'application',
        'create-task.service.ts'
      ),
      'utf8'
    );
    const repository = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'repositories', 'task.repository.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async batchCreate(dtos: CreateTaskDto[])');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  /** Status integrity checks', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    // Application service delegates rollback; repository owns the bulk SQL shape.
    expect(fn).toContain('batchRollback(this.prisma, createdIds)');
    expect(fn).not.toContain('ROLLBACK_CHUNK');
    expect(repository).toContain('const ROLLBACK_CHUNK = 100');
    expect(repository).toMatch(
      /DELETE FROM "DistributionTask"[\s\S]{0,120}WHERE "taskId" IN \(\$\{ph\}\)/
    );
    expect(repository).toContain(`"status" IN ('draft', 'waiting_audit', 'scheduled')`);
    // No per-id serial DELETE in either application orchestration or repository helper.
    expect(fn).not.toMatch(
      /for\s*\(\s*const\s+taskId\s+of\s+createdIds\s*\)[\s\S]{0,200}DELETE FROM "DistributionTask"/
    );
  });

  it('insertAttributions failure path binary-splits (UNIQUE + non-UNIQUE)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'attribution', 'attribution.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('private async insertAttributions(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  private async insertAttribution(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    // Binary split on any multi-row failure (residual #96 UNIQUE + #102 non-UNIQUE).
    expect(fn).toContain('Math.ceil(chunk.length / 2)');
    expect(fn).toMatch(/chunk\.slice\(0,\s*mid\)/);
    expect(fn).toMatch(/chunk\.slice\(mid\)/);
    // No N serial insertAttribution loop over the chunk.
    expect(fn).not.toMatch(
      /for\s*\(\s*const\s+orderId\s+of\s+chunk\s*\)[\s\S]{0,80}insertAttribution/
    );
    // Size-1 still falls to single-row helper.
    expect(fn).toMatch(/chunk\.length\s*<=\s*1/);
    expect(fn).toContain('insertAttributions');
  });
});
