import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('data analysis manual reload', () => {
  it('shows the honest local reload action only with refresh permission', async () => {
    const view = await readFile(path.join(__dirname, '../../views/DataAnalysisView.vue'), 'utf8');

    expect(view).toContain("permissions.includes('analytics:refresh')");
    expect(view).toContain('v-if="canRefresh"');
    expect(view).toContain('重新加载本地数据');
    expect(view).toContain('@click="page.reload(true)"');
  });
});
