import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → alerts → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #221 alerts as-of date filter', () => {
  it('alert.api getAlerts accepts date', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/alert.api.ts'), 'utf8');
    expect(src).toMatch(/getAlerts[\s\S]{0,200}date\?:/);
  });

  it('alert-core filters + load + watch pass date', async () => {
    const src = await readFile(path.join(__dirname, 'alert-core.ts'), 'utf8');
    expect(src).toMatch(/filters:\s*reactive\(\{[\s\S]{0,80}date:\s*''/);
    expect(src).toMatch(/getAlerts\(\{[\s\S]{0,300}date/);
    expect(src).toMatch(/args\.filters\.date/);
    // clearFilters resets date (body may be multi-line).
    expect(src).toMatch(/filters\.date\s*=\s*''/);
  });

  it('AlertFilters exposes date picker', async () => {
    const src = await readFile(path.join(__dirname, '../components/AlertFilters.vue'), 'utf8');
    expect(src).toMatch(/el-date-picker/);
    expect(src).toMatch(/update:date/);
    expect(src).toMatch(/YYYY-MM-DD/);
  });

  it('AlertListSection + AlertsView wire update:date', async () => {
    const section = await readFile(
      path.join(__dirname, '../components/AlertListSection.vue'),
      'utf8'
    );
    expect(section).toMatch(/update:date/);

    const view = await readFile(path.join(srcRoot, 'views/AlertsView.vue'), 'utf8');
    expect(view).toMatch(/@update:date="filters\.date = \$event"/);
  });
});
