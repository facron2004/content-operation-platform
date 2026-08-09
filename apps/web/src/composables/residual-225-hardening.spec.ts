import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '..');

describe('residual #225 recommendations as-of date', () => {
  it('package.api RecommendationsParams accepts date', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/package.api.ts'), 'utf8');
    expect(src).toMatch(/date\?:/);
  });

  it('loadRecommendationsPage forwards date + cache key + watch', async () => {
    const src = await readFile(path.join(__dirname, 'recommendations-page-loaders.ts'), 'utf8');
    const actionsSrc = await readFile(
      path.join(__dirname, 'recommendations-page-actions.ts'),
      'utf8'
    );
    expect(src).toMatch(/asOfDate/);
    // Pin body assignment (comment distance can exceed a tight getRecommendations slice).
    expect(src).toMatch(/date:\s*asOfDate\s*\|\|\s*undefined/);
    expect(actionsSrc).toMatch(/watch\(\(\)\s*=>\s*options\.filters\.date/);
    expect(actionsSrc).toMatch(/filters\.date\s*=\s*''/);
  });

  it('RecommendationsFilterBar exposes date picker', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/recommendations/components/RecommendationsFilterBar.vue'),
      'utf8'
    );
    expect(src).toMatch(/el-date-picker/);
    expect(src).toMatch(/update:date/);
    expect(src).toMatch(/YYYY-MM-DD/);
  });

  it('RecommendationsView wires date v-model', async () => {
    const src = await readFile(path.join(srcRoot, 'views/RecommendationsView.vue'), 'utf8');
    expect(src).toMatch(/v-model:date="filters\.date"/);
  });
});
