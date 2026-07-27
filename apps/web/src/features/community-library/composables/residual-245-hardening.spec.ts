import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// components → community-library → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #245 community batch create deep-link', () => {
  it('CommunityDetailCard exposes batch CTA with groupId + batch=1', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/community-library/components/CommunityDetailCard.vue'),
      'utf8'
    );
    expect(src).toMatch(/goBatchCreateTask/);
    expect(src).toMatch(/批量建任务/);
    const fnStart = src.indexOf('function goBatchCreateTask');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('</script>', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/name:\s*['"]tasks['"]/);
    expect(fn).toMatch(/groupId/);
    expect(fn).toMatch(/batch:\s*['"]1['"]/);
  });

  it('CampaignTaskList already has batch CTA (parity baseline)', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/campaigns/components/CampaignTaskList.vue'),
      'utf8'
    );
    expect(src).toMatch(/goBatchCreateTask/);
    expect(src).toMatch(/batch:\s*['"]1['"]/);
  });

  it('TaskCenterView already auto-opens batch dialog on batch=1', async () => {
    const src = await readFile(path.join(srcRoot, 'views/TaskCenterView.vue'), 'utf8');
    expect(src).toMatch(/route\.query\.batch|batchFlag/);
    expect(src).toMatch(/openBatchForm/);
    expect(src).toMatch(/delete nextQuery\.batch/);
  });

  it('openBatchForm seeds groupId from filters (community deep-link)', async () => {
    const src = await readFile(path.join(srcRoot, 'views/TaskCenterView.vue'), 'utf8');
    const fnStart = src.indexOf('function openBatchForm');
    expect(fnStart).toBeGreaterThan(0);
    const fnEnd = src.indexOf('onMounted', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/groupId:\s*filters\.groupId/);
  });
});
