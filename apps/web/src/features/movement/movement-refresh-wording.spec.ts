import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('movement refresh wording', () => {
  it('describes local reload honestly in the page toolbar', async () => {
    const view = await readFile(path.join(__dirname, '../../views/MovementListView.vue'), 'utf8');

    expect(view).toContain('重新加载本地数据');
    expect(view).toContain('@click="reload(true)"');
    expect(view).toContain('onKpiDateChange');
  });
});
