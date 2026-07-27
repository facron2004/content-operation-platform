import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { appThrottlerConfig } from '../src/app-throttler.config';

/**
 * Nest throttler v6 binds route metadata as THROTTLER_LIMIT + namedThrottler.name.
 * Overrides keyed by a name that is not in appThrottlerConfig are silent no-ops.
 * Residual #45: every route used `default` while config only had short/medium/long.
 */

function walkTs(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTs(p, out);
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('throttler named-bucket binding', () => {
  it('registers short/medium/long and no default', () => {
    const names = appThrottlerConfig.map((t) => t.name).sort();
    expect(names).toEqual(['long', 'medium', 'short']);
    // long is the 60s bucket that route overrides bind to
    const long = appThrottlerConfig.find((t) => t.name === 'long')!;
    expect(long.ttl).toBe(60000);
    expect(long.limit).toBe(200);
  });

  it('every @Throttle decorator keys a registered bucket (not default)', () => {
    const srcRoot = join(__dirname, '../src');
    const files = walkTs(srcRoot);
    const registered = new Set(appThrottlerConfig.map((t) => t.name));
    const throttleRe = /@Throttle\(\{\s*([a-zA-Z_][\w]*)\s*:/g;
    const hits: Array<{ file: string; key: string }> = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      let m: RegExpExecArray | null;
      while ((m = throttleRe.exec(text)) !== null) {
        hits.push({ file, key: m[1] });
      }
    }
    expect(hits.length).toBeGreaterThan(50);
    const bad = hits.filter((h) => !registered.has(h.key));
    expect(bad, `unbound throttle keys: ${JSON.stringify(bad.slice(0, 10))}`).toEqual([]);
    // Regression: never re-introduce the silent-no-op `default` key.
    expect(hits.every((h) => h.key !== 'default')).toBe(true);
    // Critical routes (login / recompute) must bind long with tight limits.
    const auth = readFileSync(join(srcRoot, 'auth/auth.controller.ts'), 'utf8');
    expect(auth).toMatch(/@Throttle\(\{\s*long:\s*\{\s*limit:\s*5,\s*ttl:\s*60000\s*\}\s*\}\)/);
    const attr = readFileSync(join(srcRoot, 'attribution/attribution.controller.ts'), 'utf8');
    expect(attr).toMatch(/@Throttle\(\{\s*long:\s*\{\s*limit:\s*3,\s*ttl:\s*60000\s*\}\s*\}\)/);
  });
});
