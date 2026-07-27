import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → movement → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #234 timeline days selectable', () => {
  it('useMovementTimeline exposes setDays + clamps 7–90', async () => {
    const src = await readFile(path.join(__dirname, 'useMovementTimeline.ts'), 'utf8');
    expect(src).toMatch(/export const TIMELINE_DAY_OPTIONS\s*=\s*\[7,\s*14,\s*30,\s*60,\s*90\]/);
    expect(src).toMatch(/function clampTimelineDays/);
    expect(src).toMatch(/async function setDays/);
    expect(src).toMatch(/if \(n < 7\) return 7/);
    expect(src).toMatch(/if \(n > 90\) return 90/);
    expect(src).toMatch(/setDays,/);
  });

  it('useZeroSalesTimeline mirrors setDays + clamp', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/zero-sales/composables/useZeroSalesTimeline.ts'),
      'utf8'
    );
    expect(src).toMatch(/export const TIMELINE_DAY_OPTIONS\s*=\s*\[7,\s*14,\s*30,\s*60,\s*90\]/);
    expect(src).toMatch(/async function setDays/);
    expect(src).toMatch(/clampTimelineDays/);
  });

  it('MovementTimelineDrawer emits change-days from day chips', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/MovementTimelineDrawer.vue'),
      'utf8'
    );
    expect(src).toMatch(/change-days/);
    expect(src).toMatch(/dayOptions/);
    expect(src).toMatch(/onDaysChange/);
    expect(src).toMatch(/day-chip/);
  });

  it('ZeroSalesTimelineDrawer emits change-days from day chips', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/zero-sales/components/ZeroSalesTimelineDrawer.vue'),
      'utf8'
    );
    expect(src).toMatch(/change-days/);
    expect(src).toMatch(/dayOptions/);
    expect(src).toMatch(/onDaysChange/);
  });

  it('parents wire @change-days to setTimelineDays', async () => {
    const movementView = await readFile(path.join(srcRoot, 'views/MovementListView.vue'), 'utf8');
    const zeroBody = await readFile(
      path.join(srcRoot, 'features/zero-sales/components/ZeroSalesPageBody.vue'),
      'utf8'
    );
    expect(movementView).toMatch(/@change-days="setTimelineDays"/);
    expect(movementView).toMatch(/setDays:\s*setTimelineDays/);
    expect(zeroBody).toMatch(/@change-days="setTimelineDays"/);
    expect(zeroBody).toMatch(/setDays:\s*setTimelineDays/);
  });

  it('API timeline DTOs already accept days 7–90', async () => {
    const movementDto = await readFile(
      path.resolve(__dirname, '../../../../../../apps/api/src/movement/movement.dto.ts'),
      'utf8'
    );
    const zeroDto = await readFile(
      path.resolve(__dirname, '../../../../../../apps/api/src/zero-sales/zero-sales.dto.ts'),
      'utf8'
    );
    expect(movementDto).toMatch(/class MovementTimelineQueryDto/);
    expect(movementDto).toMatch(/@Min\(7\)/);
    expect(movementDto).toMatch(/@Max\(90\)/);
    expect(zeroDto).toMatch(/class ZeroSalesTimelineQueryDto/);
    expect(zeroDto).toMatch(/@Min\(7\)/);
    expect(zeroDto).toMatch(/@Max\(90\)/);
  });
});
