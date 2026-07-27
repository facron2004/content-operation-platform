import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #190 form create/edit list refresh', () => {
  it('useTaskForm accepts options.onSaved and awaits it after success', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskForm.ts'), 'utf8');
    expect(src).toMatch(/TaskFormOptions/);
    expect(src).toMatch(/onSaved\?:/);
    expect(src).toMatch(/options\.onSaved/);
    // Must invoke after dialog close on success path.
    const submitStart = src.indexOf('async function submit');
    expect(submitStart).toBeGreaterThanOrEqual(0);
    const submitEnd = src.indexOf('const exported', submitStart + 10);
    const submit = src.slice(submitStart, submitEnd > 0 ? submitEnd : undefined);
    expect(submit).toMatch(/onSaved/);
    expect(submit).toMatch(/dialogVisible\.value\s*=\s*false/);
  });

  it('TaskCenterView wires useTaskForm onSaved to refresh + loadKPIs', async () => {
    const src = await readFile(path.join(srcRoot, 'views/TaskCenterView.vue'), 'utf8');
    expect(src).toMatch(/useTaskForm\s*\(/);
    expect(src).toMatch(/onSaved/);
    expect(src).toMatch(/refresh\s*\(/);
    expect(src).toMatch(/loadKPIs\s*\(/);
  });

  it('CampaignsView wires useCampaignForm onSuccess to refresh', async () => {
    const src = await readFile(path.join(srcRoot, 'views/CampaignsView.vue'), 'utf8');
    // Signature is useCampaignForm(existing?, options) — must pass undefined first.
    expect(src).toMatch(/useCampaignForm\s*\(\s*undefined\s*,\s*\{\s*onSuccess/);
    expect(src).toMatch(/refresh\s*\(/);
  });

  it('useCampaignForm still awaits options.onSuccess after success', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/campaigns/composables/useCampaignForm.ts'),
      'utf8'
    );
    expect(src).toMatch(/onSuccess\?:/);
    expect(src).toMatch(/await options\.onSuccess/);
  });
});
