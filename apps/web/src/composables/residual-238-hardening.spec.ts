import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → src
const srcRoot = path.resolve(__dirname, '..');

describe('residual #238 generate form scenario wire-up', () => {
  it('GenerateForm includes scenario field', async () => {
    const src = await readFile(path.join(srcRoot, 'components/ai-config-types.ts'), 'utf8');
    expect(src).toMatch(/scenario:\s*string/);
  });

  it('useGenerate form seeds scenario string', async () => {
    const src = await readFile(path.join(__dirname, 'useGenerate.ts'), 'utf8');
    expect(src).toMatch(/scenario:\s*''/);
  });

  it('generateCopiesAction forwards scenario empty→undefined', async () => {
    const src = await readFile(path.join(__dirname, 'generate-core.ts'), 'utf8');
    expect(src).toMatch(/GENERATE_SCENARIO_PRESETS/);
    expect(src).toMatch(/scenario:\s*string/);
    expect(src).toMatch(/scenario:\s*options\.scenario\.trim\(\)\s*\|\|\s*undefined/);
    expect(src).toMatch(/scenario:\s*params\.form\.scenario/);
  });

  it('AiGenerateFormFields exposes scenario control + presets', async () => {
    const src = await readFile(path.join(srcRoot, 'components/AiGenerateFormFields.vue'), 'utf8');
    expect(src).toMatch(/form\.scenario/);
    expect(src).toMatch(/GENERATE_SCENARIO_PRESETS/);
    expect(src).toMatch(/applyScenarioPreset/);
  });

  it('GenerateCopyRequest + GenerateCopyDto already accept scenario (API ready)', async () => {
    const shared = await readFile(
      path.resolve(__dirname, '../../../../packages/shared/src/copy-types.ts'),
      'utf8'
    );
    expect(shared).toMatch(/scenario\?:/);

    const dto = await readFile(
      path.resolve(__dirname, '../../../../apps/api/src/content/content.dto.ts'),
      'utf8'
    );
    expect(dto).toMatch(/scenario\?:/);
  });
});
