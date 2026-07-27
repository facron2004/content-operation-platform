import { describe, expect, it } from 'vitest';

describe('residual #129 DT update freeze/FK projection', () => {
  it('exposes getTaskUpdateMeta and update uses it for pre-load + failure arm', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    // Residual #156: getTaskUpdateMeta is public so controller can scope + preload.
    expect(src).toMatch(/async getTaskUpdateMeta\(/);
    expect(src).toMatch(
      /t\."status", t\."publishedAt", t\."packageId", t\."contentId", t\."campaignId", t\."groupId", t\."fallbackPackageId"/
    );
    expect(src).toMatch(/LEFT JOIN "ContentPackage"/);

    const fnStart = src.indexOf('async update(');
    expect(fnStart).toBeGreaterThan(0);
    const candidates = [
      src.indexOf('\n  async ', fnStart + 10),
      src.indexOf('\n  /**', fnStart + 10),
      src.indexOf('\n  private ', fnStart + 10)
    ].filter((i) => i > 0);
    const next = candidates.length ? Math.min(...candidates) : fnStart + 3000;
    const fn = src.slice(fnStart, next);

    // Residual #156: optional preloadedMeta; fallback getTaskUpdateMeta.
    // Residual #165: happy path slim shell via $executeRawUnsafe (no full-row payload).
    expect(fn).toMatch(/preloadedMeta \?\? \(await this\.getTaskUpdateMeta\(id\)\)/);
    expect(fn).toMatch(/const latest = await this\.getTaskUpdateMeta\(id\)/);
    expect(fn).toMatch(/\$executeRawUnsafe/);
    expect(fn).not.toMatch(/\bRETURNING\b/);
    expect(fn).toMatch(/success:\s*true/);
    // Residual #153: empty-set short-circuit synthesizes shell (no getTaskRow re-SELECT).
    expect(fn).toMatch(/if \(sets\.length === 0\)/);
    expect(fn).not.toMatch(/if \(sets\.length === 0\) return this\.getTaskRow\(id\)/);
    expect(fn).not.toMatch(/return this\.getTaskRow\(id\)/);
    // Must not pre-load full row for freeze decision.
    expect(fn).not.toMatch(/const existing = await this\.getTaskRow\(id\)/);
    expect(fn).not.toMatch(/const latest = await this\.getTaskRow\(id\)/);
  });
});
