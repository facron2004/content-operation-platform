import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → src
const srcRoot = path.resolve(__dirname, '..');

describe('residual #220 recommendations merchantId filter', () => {
  it('package.api getRecommendations accepts merchantId', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/package.api.ts'), 'utf8');
    expect(src).toMatch(/RecommendationsParams[\s\S]{0,200}merchantId\?:/);
  });

  it('loadRecommendationsPage forwards merchantId + includes it in cache key', async () => {
    const src = await readFile(path.join(__dirname, 'recommendations-page-loaders.ts'), 'utf8');
    const actionsSrc = await readFile(
      path.join(__dirname, 'recommendations-page-actions.ts'),
      'utf8'
    );
    expect(src).toMatch(/filters:\s*\{[\s\S]{0,120}merchantId/);
    expect(src).toMatch(/getRecommendations\(\{[\s\S]{0,300}merchantId/);
    expect(src).toMatch(/o\.filters\.merchantId/);
    expect(actionsSrc).toMatch(/watch\(\(\)\s*=>\s*options\.filters\.merchantId/);
  });

  it('RecommendationsFilterBar exposes merchantId input', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/recommendations/components/RecommendationsFilterBar.vue'),
      'utf8'
    );
    expect(src).toMatch(/update:merchantId/);
    expect(src).toMatch(/merchantId/);
  });

  it('RecommendationsView wires v-model:merchant-id', async () => {
    const src = await readFile(path.join(srcRoot, 'views/RecommendationsView.vue'), 'utf8');
    expect(src).toMatch(/v-model:merchant-id="filters\.merchantId"/);
  });
});
