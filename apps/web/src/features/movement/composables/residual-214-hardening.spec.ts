import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → movement → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #214 movement merchantId/category/areaId filters', () => {
  it('movement.api client already accepts merchantId/category/areaId on list endpoints', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/movement.api.ts'), 'utf8');
    expect(src).toMatch(/export async function getMovementStagnant/);
    expect(src).toMatch(/export async function getMovementMoving/);
    expect(src).toMatch(/merchantId\?:/);
    expect(src).toMatch(/category\?:/);
    expect(src).toMatch(/areaId\?:/);
  });

  it('movement-list-core filters type + load pass merchantId/category/areaId', async () => {
    const src = await readFile(path.join(__dirname, 'movement-list-core.ts'), 'utf8');
    expect(src).toMatch(/merchantId\?:/);
    expect(src).toMatch(/category\?:/);
    expect(src).toMatch(/areaId\?:/);
    // Loader must forward all three — pin on call sites (not the import).
    expect(src).toMatch(/getMovementStagnant\(\s*\{[\s\S]{0,400}merchantId/);
    expect(src).toMatch(/getMovementStagnant\(\s*\{[\s\S]{0,400}category/);
    expect(src).toMatch(/getMovementStagnant\(\s*\{[\s\S]{0,400}areaId/);
    expect(src).toMatch(/getMovementMoving\(\s*\{[\s\S]{0,400}merchantId/);
    expect(src).toMatch(/getMovementMoving\(\s*\{[\s\S]{0,400}category/);
    expect(src).toMatch(/getMovementMoving\(\s*\{[\s\S]{0,400}areaId/);
  });

  it('MovementFilterControls exposes merchantId/category/areaId inputs', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/MovementFilterControls.vue'),
      'utf8'
    );
    expect(src).toMatch(/filters\.merchantId/);
    expect(src).toMatch(/filters\.category/);
    expect(src).toMatch(/filters\.areaId/);
    expect(src).toMatch(/商家 ID|区域 ID|品类/);
  });

  it('export CSV includes merchantId/category/areaId', async () => {
    const src = await readFile(path.join(__dirname, 'movement-list-ui.ts'), 'utf8');
    expect(src).toMatch(
      /merchantId:\s*options\.filters\.value\.merchantId|merchantId:\s*params\.merchantId/
    );
    expect(src).toMatch(
      /category:\s*options\.filters\.value\.category|category:\s*params\.category/
    );
    expect(src).toMatch(/areaId:\s*options\.filters\.value\.areaId|areaId:\s*params\.areaId/);
  });
});
