import { describe, expect, it } from 'vitest';

describe('residual #126 rule-config findUnique select slim', () => {
  it('activateRuleVersion pre-read selects cohort fields only (no payload)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'rule-config-ops.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('export async function activateRuleVersion(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\nexport async function createRuleAndInvalidate', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    // Residual #126: select narrow for cohort pin.
    expect(fn).toMatch(
      /select:\s*\{\s*tenantId:\s*true,\s*merchantId:\s*true,\s*type:\s*true\s*\}/
    );
    // Must not bare findUnique without select inside the transaction pre-read.
    expect(fn).not.toMatch(/findUnique\(\{\s*where:\s*\{\s*id\s*\}\s*\}\)/);
  });

  it('deleteRuleAndInvalidate pre-read selects merchantId/type/isActive only', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'content', 'rule-config-ops.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('export async function deleteRuleAndInvalidate(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\nexport async function resolveEffectiveRules', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    expect(fn).toMatch(
      /select:\s*\{\s*merchantId:\s*true,\s*type:\s*true,\s*isActive:\s*true\s*\}/
    );
    // Failure arm is existence-only.
    expect(fn).toMatch(/select:\s*\{\s*id:\s*true\s*\}/);
    // No full-row findUnique without select.
    expect(fn).not.toMatch(/findUnique\(\{\s*where:\s*\{\s*id\s*\}\s*\}\)/);
  });
});
