import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');
const sharedRoot = path.resolve(srcRoot, '../../../packages/shared/src');

describe('residual #255 execution timeline surfaces failCategory', () => {
  it('TaskExecutionTimeline shows failCategory tag + label map', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/TaskExecutionTimeline.vue'),
      'utf8'
    );
    expect(src).toMatch(/exec\.failCategory/);
    expect(src).toMatch(/failCategoryLabel/);
    expect(src).toMatch(/failCategoryLabels/);
    expect(src).toMatch(/content_issue/);
    expect(src).toMatch(/package_offline/);
    expect(src).toMatch(/out_of_stock/);
  });

  it('TaskFailDialog already writes failCategory (baseline)', async () => {
    const src = await readFile(path.join(__dirname, '../components/TaskFailDialog.vue'), 'utf8');
    expect(src).toMatch(/form\.failCategory/);
    expect(src).toMatch(/categoryOptions/);
    expect(src).toMatch(/content_issue/);
  });

  it('shared DistributionExecution declares failCategory (baseline)', async () => {
    const shared = await readFile(path.join(sharedRoot, 'api-task-types.ts'), 'utf8');
    expect(shared).toMatch(/export interface DistributionExecution/);
    expect(shared).toMatch(/failCategory\?:/);
  });

  it('API execution SELECT/map projects failCategory (baseline)', async () => {
    const src = await readFile(
      path.resolve(
        __dirname,
        '../../../../../../apps/api/src/distribution-task/distribution-execution.service.ts'
      ),
      'utf8'
    );
    expect(src).toMatch(/failCategory/);
    expect(src).toMatch(/failCategory:\s*r\.failCategory/);
  });
});
