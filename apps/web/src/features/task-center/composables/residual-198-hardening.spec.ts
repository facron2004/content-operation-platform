import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #198 nested create CTA + create=1 auto-open', () => {
  it('CampaignTaskList deep-links create with campaignId + create=1', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/campaigns/components/CampaignTaskList.vue'),
      'utf8'
    );
    expect(src).toMatch(/goCreateTask/);
    expect(src).toMatch(/新建任务/);
    const fnStart = src.indexOf('function goCreateTask');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('</script>', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/name:\s*['"]tasks['"]/);
    expect(fn).toMatch(/campaignId:\s*props\.campaignId/);
    expect(fn).toMatch(/create:\s*['"]1['"]/);
  });

  it('CommunityDetailCard deep-links create with groupId + create=1', async () => {
    const src = await readFile(
      path.join(srcRoot, 'features/community-library/components/CommunityDetailCard.vue'),
      'utf8'
    );
    expect(src).toMatch(/goCreateTask/);
    expect(src).toMatch(/新建任务/);
    const fnStart = src.indexOf('function goCreateTask');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('</script>', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/name:\s*['"]tasks['"]/);
    expect(fn).toMatch(/groupId/);
    expect(fn).toMatch(/create:\s*['"]1['"]/);
  });

  it('TaskCenterView auto-opens form when create=1 and strips query', async () => {
    const src = await readFile(path.join(srcRoot, 'views/TaskCenterView.vue'), 'utf8');
    expect(src).toMatch(/useRoute/);
    expect(src).toMatch(/onMounted/);
    expect(src).toMatch(/route\.query\.create/);
    expect(src).toMatch(/openForm\(\)/);
    expect(src).toMatch(/delete nextQuery\.create|delete nextQuery\[['"]create['"]\]/);
    expect(src).toMatch(/router\.replace/);
  });
});
