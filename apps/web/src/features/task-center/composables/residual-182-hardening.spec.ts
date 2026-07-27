import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');
const sharedRoot = path.resolve(srcRoot, '../../../packages/shared/src');

describe('residual #182 task detail performance surface', () => {
  it('shared TaskPerformanceResponse includes optional date window', async () => {
    const src = await readFile(path.join(sharedRoot, 'api-campaign-types.ts'), 'utf8');
    const typeStart = src.indexOf('export interface TaskPerformanceResponse');
    expect(typeStart).toBeGreaterThanOrEqual(0);
    const typeEnd = src.indexOf('export interface CampaignPerformanceResponse', typeStart + 10);
    const typeBlock = src.slice(typeStart, typeEnd > 0 ? typeEnd : undefined);
    expect(typeBlock).toMatch(/visits:\s*number/);
    expect(typeBlock).toMatch(/orders:\s*number/);
    expect(typeBlock).toMatch(/gmv:\s*number/);
    expect(typeBlock).toMatch(/verifyRate:\s*number/);
    expect(typeBlock).toMatch(/refundRate:\s*number/);
    expect(typeBlock).toMatch(/conversionRate:\s*number/);
    // Residual #182: API emits dateFrom/dateTo (interactive 90d window).
    expect(typeBlock).toMatch(/dateFrom\?:\s*string/);
    expect(typeBlock).toMatch(/dateTo\?:\s*string/);
  });

  it('useTaskDetail loadDetail fans out getTask + getTaskPerformance (not getTaskKPIs)', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskDetail.ts'), 'utf8');
    const loadStart = src.indexOf('async function loadDetail');
    expect(loadStart).toBeGreaterThan(0);
    const loadEnd = src.indexOf('\n  /**', loadStart + 10);
    const loadFn = src.slice(loadStart, loadEnd > 0 ? loadEnd : undefined);
    expect(loadFn).toMatch(/Promise\.all/);
    expect(loadFn).toMatch(/api\.getTask\(taskId\)/);
    expect(loadFn).toMatch(/api\.getTaskPerformance\(taskId\)/);
    expect(loadFn).not.toMatch(/api\.getTaskKPIs/);
    // performance ref is task-scoped TPD shape.
    expect(src).toMatch(/performance\s*=\s*ref<TaskPerformanceResponse/);
    expect(src).not.toMatch(/TaskKpiResponse/);
  });

  it('TaskPerformanceSummary renders task-scoped visit/order/rate metrics', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/TaskPerformanceSummary.vue'),
      'utf8'
    );
    expect(src).toMatch(/TaskPerformanceResponse/);
    expect(src).toMatch(/访问量/);
    expect(src).toMatch(/订单数/);
    expect(src).toMatch(/累计 GMV/);
    expect(src).toMatch(/转化率/);
    expect(src).toMatch(/核销率/);
    expect(src).toMatch(/退款率/);
    // Must not render campaign/community aggregate labels.
    expect(src).not.toMatch(/任务总数/);
    expect(src).not.toMatch(/已完成/);
    expect(src).not.toMatch(/已失败/);
    // Format helpers for money + rates.
    expect(src).toMatch(/formatGmv/);
    expect(src).toMatch(/formatPercent/);
  });

  it('TaskDetailView mounts TaskPerformanceSummary with performance prop', async () => {
    const src = await readFile(path.join(srcRoot, 'views/TaskDetailView.vue'), 'utf8');
    expect(src).toMatch(/TaskPerformanceSummary/);
    expect(src).toMatch(/:performance="performance"/);
    // Destructure performance from composable (template unwrap).
    expect(src).toMatch(/\bperformance\b/);
    // Still never calls platform getTaskKPIs or mutates APIs directly.
    expect(src).not.toMatch(/api\.getTaskKPIs/);
    expect(src).not.toMatch(/api\.getTaskPerformance/);
  });

  it('task.api getTaskPerformance is TaskPerformanceResponse', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/task.api.ts'), 'utf8');
    const fnStart = src.indexOf('export async function getTaskPerformance');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('export async function', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/cachedGet<TaskPerformanceResponse>/);
    expect(fn).toMatch(/\/tasks\/\$\{encodeURIComponent\(id\)\}\/performance/);
  });
});
