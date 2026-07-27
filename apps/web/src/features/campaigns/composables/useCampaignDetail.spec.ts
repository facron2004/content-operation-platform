import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('residual #124 campaign runAction body reuse', () => {
  it('runAction applies action body and does not call loadDetail', async () => {
    const src = await readFile(path.join(__dirname, 'useCampaignDetail.ts'), 'utf8');

    const fnStart = src.indexOf('async function runAction(');
    expect(fnStart).toBeGreaterThan(0);
    // Slice until the next async function (startCampaign).
    const next = src.indexOf('\n  async function startCampaign', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : undefined);

    // Apply returned campaign body.
    expect(fn).toMatch(/campaign\.value\s*=\s*result as MarketingCampaign/);
    // Must not re-fetch detail after a successful transition.
    expect(fn).not.toMatch(/await loadDetail\s*\(/);
    // Still awaits the action itself.
    expect(fn).toMatch(/await action\s*\(/);
  });
});
