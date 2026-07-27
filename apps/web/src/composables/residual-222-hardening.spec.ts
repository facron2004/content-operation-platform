import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '..');

describe('residual #222 recommendations inventoryMin/Max filters', () => {
  it('package.api RecommendationsParams accepts inventoryMin/Max', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/package.api.ts'), 'utf8');
    expect(src).toMatch(/inventoryMin\?:/);
    expect(src).toMatch(/inventoryMax\?:/);
  });

  it('loadRecommendationsPage forwards inventoryMin/Max + cache key', async () => {
    const src = await readFile(path.join(__dirname, 'useRecommendationsPage.ts'), 'utf8');
    expect(src).toMatch(/inventoryMin/);
    expect(src).toMatch(/inventoryMax/);
    // Pin body assignment (comment distance can exceed a tight getRecommendations slice).
    expect(src).toMatch(/inventoryMin:\s*inventoryMinNum/);
    expect(src).toMatch(/inventoryMax:\s*inventoryMaxNum/);
    expect(src).toMatch(/watch\(\(\)\s*=>\s*options\.filters\.inventoryMin/);
    expect(src).toMatch(/filters\.inventoryMin\s*=\s*''/);
  });

  it('RecommendationsFilterBar exposes inventory min/max inputs', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/recommendations/components/RecommendationsFilterBar.vue'),
      'utf8'
    );
    expect(src).toMatch(/update:inventoryMin/);
    expect(src).toMatch(/update:inventoryMax/);
  });

  it('RecommendationsView wires inventory min/max v-models', async () => {
    const src = await readFile(path.join(srcRoot, 'views/RecommendationsView.vue'), 'utf8');
    expect(src).toMatch(/v-model:inventory-min="filters\.inventoryMin"/);
    expect(src).toMatch(/v-model:inventory-max="filters\.inventoryMax"/);
  });
});
