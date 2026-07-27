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
    expect(src).toMatch(/getMovementToday\(params\.date\s*\|\|\s*undefined\)/);
    expect(src).toMatch(/date:\s*state\.kpiDate\.value/);
  });

  it('MovementHero exposes date picker', async () => {
    const src = await readFile(path.join(__dirname, '../components/MovementHero.vue'), 'utf8');
    expect(src).toMatch(/el-date-picker/);
    expect(src).toMatch(/update:kpiDate/);
    expect(src).toMatch(/date-change/);
  });

  it('MovementListView wires kpiDate v-model + date-change reload', async () => {
    const src = await readFile(path.join(srcRoot, 'views/MovementListView.vue'), 'utf8');
    expect(src).toMatch(/v-model:kpi-date="kpiDate"/);
    expect(src).toMatch(/@date-change="reload"/);
  });
});
