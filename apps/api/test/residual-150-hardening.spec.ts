import { describe, expect, it } from 'vitest';

describe('residual #150 rule activate/create list-select response (no payload)', () => {
  it('activateRuleVersion update selects RULE_CONFIG_LIST_SELECT', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'rule-config-write.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('export async function activateRuleVersion(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\nexport async function createRuleAndInvalidate', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    // Residual #126 pre-read cohort pin preserved.
    expect(fn).toMatch(
      /select:\s*\{\s*tenantId:\s*true,\s*merchantId:\s*true,\s*type:\s*true\s*\}/
    );
    // Residual #150: activate write returns list shell (no payload blob).
    expect(fn).toMatch(
      /ruleConfig\.update\(\{\s*where:\s*\{\s*id\s*\},\s*data:\s*\{\s*isActive:\s*true\s*\},\s*select:\s*RULE_CONFIG_LIST_SELECT/
    );
    // Must not bare update without select (would return full row incl payload).
    expect(fn).not.toMatch(
      /ruleConfig\.update\(\{\s*where:\s*\{\s*id\s*\},\s*data:\s*\{\s*isActive:\s*true\s*\}\s*\}\)/
    );
  });

  it('createRuleVersion create selects RULE_CONFIG_LIST_SELECT', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'rule-config-write.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('export async function createRuleVersion(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\n/**\n * Keep at most RULE_CONFIG_INACTIVE_KEEP', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 2500);

    // Residual #150: create returns list projection (SPA reloads list).
    expect(fn).toMatch(/select:\s*RULE_CONFIG_LIST_SELECT/);
    expect(fn).toMatch(/mapRuleConfig\(created\)/);
    // Payload is still written into the row (just not returned).
    expect(fn).toMatch(/payload:\s*JSON\.stringify\(dto\.payload\)/);
  });
});
