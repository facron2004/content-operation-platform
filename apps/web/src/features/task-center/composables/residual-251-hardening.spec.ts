import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('residual #251 task detail surfaces #233 write fields', () => {
  it('TaskDetailPanel shows contentId / riskLevel / fallbackPackageId', async () => {
    const src = await readFile(path.join(__dirname, '../components/TaskDetailPanel.vue'), 'utf8');
    expect(src).toMatch(/task\.contentId/);
    expect(src).toMatch(/task\.riskLevel/);
    expect(src).toMatch(/task\.fallbackPackageId/);
    expect(src).toMatch(/文案 ID|文案ID/);
    expect(src).toMatch(/风险等级/);
    expect(src).toMatch(/承接套餐/);
    expect(src).toMatch(/riskLabel/);
    expect(src).toMatch(/riskType/);
  });

  it('DistributionTask shared type already declares residual fields (baseline #233)', async () => {
    const shared = await readFile(
      path.resolve(__dirname, '../../../../../../packages/shared/src/api-task-types.ts'),
      'utf8'
    );
    expect(shared).toMatch(/contentId\?:/);
    expect(shared).toMatch(/riskLevel\?:/);
    expect(shared).toMatch(/fallbackPackageId\?:/);
  });

  it('API task row SELECT still projects residual fields (baseline)', async () => {
    const src = await readFile(
      path.resolve(
        __dirname,
        '../../../../../../apps/api/src/distribution-task/distribution-task-query.ts'
      ),
      'utf8'
    );
    expect(src).toMatch(/contentId/);
    expect(src).toMatch(/riskLevel/);
    expect(src).toMatch(/fallbackPackageId/);
  });
});
