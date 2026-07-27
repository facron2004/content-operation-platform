import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const webRoot = path.join(__dirname, '..', '..', 'web', 'src');

describe('residual #268 generate package picker first-200 honesty', () => {
  it('loadGeneratePackages sinks truncated/limit/matchedCount honesty', async () => {
    const src = await readFile(path.join(webRoot, 'composables', 'generate-core.ts'), 'utf8');
    expect(src).toMatch(/GENERATE_PACKAGE_PICKER_PAGE_SIZE\s*=\s*200/);
    const fnStart = src.indexOf('export async function loadGeneratePackages');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('\nexport async function loadGenerateBattleCard', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/pageSize:\s*GENERATE_PACKAGE_PICKER_PAGE_SIZE/);
    expect(fn).toMatch(/data\.truncated/);
    expect(fn).toMatch(/data\.limit/);
    expect(fn).toMatch(/data\.matchedCount/);
    expect(fn).toMatch(/listTruncated/);
    expect(fn).toMatch(/pageTotal\s*>\s*packages\.value\.length/);
  });

  it('useGenerate holds honesty refs and passes them to loadGeneratePackages', async () => {
    const src = await readFile(path.join(webRoot, 'composables', 'useGenerate.ts'), 'utf8');
    expect(src).toMatch(/listTruncated\s*=\s*ref\(false\)/);
    expect(src).toMatch(/listLimit\s*=\s*ref/);
    expect(src).toMatch(/matchedCount\s*=\s*ref/);
    expect(src).toMatch(/loadGeneratePackages\(\s*packages\s*,\s*form\s*,\s*\{/);
    expect(src).toMatch(/listTruncated/);
  });

  it('buildUseGenerateReturn exposes honesty fields', async () => {
    const src = await readFile(path.join(webRoot, 'composables', 'generate-core.ts'), 'utf8');
    const start = src.indexOf('export function buildUseGenerateReturn');
    expect(start).toBeGreaterThanOrEqual(0);
    const block = src.slice(start, start + 2500);
    expect(block).toMatch(/listTruncated\?:/);
    expect(block).toMatch(/listLimit\?:/);
    expect(block).toMatch(/matchedCount\?:/);
    expect(block).toMatch(/listTruncated:\s*p\.listTruncated/);
  });

  it('AiGenerateFormFields shows list-cap-hint when truncated', async () => {
    const src = await readFile(
      path.join(webRoot, 'components', 'AiGenerateFormFields.vue'),
      'utf8'
    );
    expect(src).toMatch(/list-cap-hint/);
    expect(src).toMatch(/truncated/);
    expect(src).toMatch(/matchedCount|matchedLabel|matched-count/);
    expect(src).toMatch(/评分最高的前/);
  });

  it('GenerateView wires honesty props through GenerateConsoleGrid', async () => {
    const view = await readFile(path.join(webRoot, 'views', 'GenerateView.vue'), 'utf8');
    expect(view).toMatch(/:truncated="listTruncated"/);
    expect(view).toMatch(/:limit="listLimit"/);
    expect(view).toMatch(/:matched-count="matchedCount"/);

    const grid = await readFile(
      path.join(webRoot, 'features', 'generate', 'components', 'GenerateConsoleGrid.vue'),
      'utf8'
    );
    expect(grid).toMatch(/:truncated="truncated"/);
    expect(grid).toMatch(/:limit="limit"/);
    expect(grid).toMatch(/:matched-count="matchedCount"/);

    const panel = await readFile(path.join(webRoot, 'components', 'AiConfigPanel.vue'), 'utf8');
    expect(panel).toMatch(/:truncated="truncated"/);
    expect(panel).toMatch(/:matched-count="matchedCount"/);
  });
});
