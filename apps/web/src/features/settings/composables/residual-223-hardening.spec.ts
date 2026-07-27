import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → settings → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #223 settings expand → getRule payload', () => {
  it('rules.api exports getRule client', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/rules.api.ts'), 'utf8');
    expect(src).toMatch(/export async function getRule/);
    expect(src).toMatch(/\/content\/rules\/\$\{id\}/);
  });

  it('API list omits payload (detail via getRuleConfigById)', async () => {
    const support = await readFile(
      path.join(srcRoot, '../../api/src/content/rule-config-support.ts'),
      'utf8'
    );
    expect(support).toMatch(/RULE_CONFIG_LIST_SELECT\s*=\s*\{[\s\S]*?id:\s*true/);
    // List select must not include payload: true.
    const start = support.indexOf('export const RULE_CONFIG_LIST_SELECT');
    const end = support.indexOf('} as const', start);
    const block = support.slice(start, end > 0 ? end : start + 400);
    expect(block).not.toMatch(/payload:\s*true/);
  });

  it('SettingsRulesTable expands via getRule + caches payload', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/SettingsRulesTable.vue'),
      'utf8'
    );
    // Call may be multi-line: api\n  .getRule(row.id)
    expect(src).toMatch(/\.getRule\(/);
    expect(src).toMatch(/@expand-change="onExpandChange"/);
    expect(src).toMatch(/payloadById/);
    expect(src).toMatch(/ensurePayload/);
  });

  it('expand no longer pretty(row.payload) alone', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/SettingsRulesTable.vue'),
      'utf8'
    );
    // Must not be the bare list-payload-only path.
    expect(src).not.toMatch(/pretty\(row\.payload\)\s*<\/pre>/);
    expect(src).toMatch(/payloadById\[row\.id\]\s*\?\?\s*row\.payload/);
  });
});
