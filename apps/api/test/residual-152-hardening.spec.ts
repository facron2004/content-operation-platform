import { describe, expect, it } from 'vitest';

describe('residual #152 community import (superseded by #171 slim shell)', () => {
  it('import returns slim shell (imported count only; no items[] / parseCommunity)', async () => {
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

    // Residual #93 multi-row INSERT preserved.
    expect(fn).toContain('COMMUNITY_IMPORT_INSERT_CHUNK');
    expect(fn).toMatch(/VALUES\s+\$\{valueClauses\}/);
    expect(fn).toContain('$transaction');

    // Residual #171: slim shell — no items[] synthesis / parseCommunity map.
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toMatch(/imported:/);
    expect(fn).not.toMatch(/const synthesized: CommunityRow\[\]/);
    expect(fn).not.toMatch(/synthesized\.push\(/);
    expect(fn).not.toMatch(/parseCommunity\(/);
    expect(fn).not.toMatch(/items:/);
    expect(fn).not.toMatch(/WHERE "groupId" IN/);
    expect(fn).not.toMatch(/SELECT \$\{COMMUNITY_ROW_COLUMNS\} FROM "CommunityGroup"/);
  });

  it('create returns slim shell (parity with import)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'community', 'community.service.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('async create(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n  async update(', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);
    expect(fn).toMatch(/success:\s*true/);
    expect(fn).toMatch(/groupId/);
    expect(fn).not.toMatch(/return parseCommunity\(\{/);
    expect(fn).not.toMatch(/return this\.getById\(/);
  });
});
