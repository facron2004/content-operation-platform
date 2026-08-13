import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → movement → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #227 movement today as-of date', () => {
  it('movement.api getMovementToday accepts date', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/movement.api.ts'), 'utf8');
    expect(src).toMatch(/getMovementToday\(date\?:/);
  });

  it('movement-list-core forwards kpiDate into getMovementToday', async () => {
    const src = await readFile(path.join(__dirname, 'movement-list-core.ts'), 'utf8');
    expect(src).toMatch(/kpiDate:\s*Ref<string>/);
    expect(src).toMatch(/kpiDate:\s*ref\(''\)/);
    expect(src).toMatch(/getMovementToday\(params\.date\s*\|\|\s*undefined,\s*params\.force\)/);
    expect(src).toMatch(/date:\s*state\.kpiDate\.value/);
  });

  it('MovementListView exposes date picker + reload in toolbar', async () => {
    const src = await readFile(path.join(srcRoot, 'views/MovementListView.vue'), 'utf8');
    expect(src).toMatch(/el-date-picker/);
    expect(src).toMatch(/onKpiDateChange/);
    expect(src).toMatch(/kpiDate\.value = next/);
    expect(src).toMatch(/reload\(\)/);
  });
});
