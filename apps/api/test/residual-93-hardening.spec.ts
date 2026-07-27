import { describe, expect, it } from 'vitest';

describe('residual #93 community import multi-row INSERT', () => {
  it('import inserts via multi-row VALUES chunks (not N serial single-row INSERT)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('async import(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async disable(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    expect(fn).toContain('COMMUNITY_IMPORT_INSERT_CHUNK');
    expect(fn).toContain('valueClauses');
    expect(fn).toMatch(/VALUES\s+\$\{valueClauses\}/);
    // Must not loop single-row INSERT per dto inside the TX body.
    expect(fn).not.toMatch(
      /for\s*\(\s*const\s+\{\s*dto,\s*owner\s*\}\s+of\s+resolved\s*\)[\s\S]{0,300}INSERT INTO "CommunityGroup"/
    );
    // Residual #171: slim shell — no post-commit re-SELECT and no items[] synthesis.
    expect(fn).not.toMatch(/WHERE "groupId" IN/);
    expect(fn).not.toMatch(/SELECT \$\{COMMUNITY_ROW_COLUMNS\} FROM "CommunityGroup"/);
    expect(fn).not.toMatch(/synthesized\.push\(/);
    expect(fn).toMatch(/imported:/);
  });

  it('import keeps outer $transaction for atomic multi-row writes', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('async import(');
    const next = src.indexOf('\n  async disable(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);
    expect(fn).toContain('$transaction');
  });
});
