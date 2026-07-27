import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → src
const srcRoot = path.resolve(__dirname, '..');

describe('residual #249 generate package picker overflow / deep-link resolve', () => {
  it('loadGeneratePackages resolves missing deep-link packageId via getPackageAnalysis', async () => {
    const src = await readFile(path.join(__dirname, 'generate-core.ts'), 'utf8');
    const fnStart = src.indexOf('export async function loadGeneratePackages');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('\nexport async function loadGenerateBattleCard', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    // Still loads first recommend page (bounded picker). Residual #268 named the cap.
    expect(fn).toMatch(
      /getRecommendations\(\s*\{\s*page:\s*1\s*,\s*pageSize:\s*GENERATE_PACKAGE_PICKER_PAGE_SIZE\s*\}/
    );
    // Residual #249: only resolve when seeded packageId is absent from list.
    expect(fn).toMatch(/form\.packageId/);
    expect(fn).toMatch(/packages\.value\.some/);
    expect(fn).toMatch(/getPackageAnalysis\(\s*form\.packageId\s*\)/);
    expect(fn).toMatch(/analysis\.package/);
    // Inject at head so select option is present.
    expect(fn).toMatch(/packages\.value\s*=\s*\[\s*analysis\.package/);
  });

  it('useGenerate still seeds form.packageId from route.query', async () => {
    const src = await readFile(path.join(__dirname, 'useGenerate.ts'), 'utf8');
    expect(src).toMatch(/packageId:\s*String\(\s*route\.query\.packageId/);
    expect(src).toMatch(/selectedPackage\s*=\s*computed/);
    expect(src).toMatch(/packages\.value\.find/);
  });

  it('bootstrapGeneratePage still awaits loadPackages before battle-card', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/generate/generate-workflow.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('export async function bootstrapGeneratePage');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('\ntype StepsIn', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    // loadPackages must complete before loadBattleCard so #249 inject is visible.
    expect(fn).toMatch(/await Promise\.all\(\[\s*options\.loadPackages\(\)/);
    expect(fn).toMatch(/options\.mode\s*===\s*['"]battle-card['"]/);
    expect(fn).toMatch(/options\.loadBattleCard\(\)/);
  });

  it('getPackageAnalysis client returns PackageAnalysisResponse with package', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/package.api.ts'), 'utf8');
    expect(src).toMatch(/export const getPackageAnalysis/);
    expect(src).toMatch(/PackageAnalysisResponse/);
    expect(src).toMatch(/\/content\/packages\/\$\{packageId\}\/analysis/);
  });
});
