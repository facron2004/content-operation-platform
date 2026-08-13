import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const componentRoot = path.resolve(__dirname, '../components');

describe('alert write-action visibility', () => {
  it('hides every resolve control behind the server-aligned canResolve capability', async () => {
    const files = await Promise.all(
      [
        'AlertTableHeader.vue',
        'AlertTableGridColumns.vue',
        'FocusPackageCard.vue',
        'AlertDetailBody.vue'
      ].map((name) => readFile(path.join(componentRoot, name), 'utf8'))
    );

    for (const source of files) {
      expect(source).toMatch(/v-if="canResolve"/);
      expect(source).toMatch(/canResolve:\s*boolean/);
    }
  });
});
