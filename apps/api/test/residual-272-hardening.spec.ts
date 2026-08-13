import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';

const srcRoot = path.join(__dirname, '..', 'src');
const webRoot = path.join(__dirname, '..', '..', 'web', 'src');

describe('residual #272 task center listTasks INTERACTIVE window honesty', () => {
  it('controller emptyScope early return projects dateFrom/dateTo', async () => {
    const src = await readFile(
      path.join(srcRoot, 'distribution-task', 'distribution-task.controller.ts'),
      'utf8'
    );
    const start = src.indexOf('list(@Query');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = src.indexOf('@Roles(', start + 10);
    const fn = src.slice(start, end > 0 ? end : start + 1500);
    expect(fn).toMatch(/resolveInteractiveDateSpan/);
    expect(fn).toMatch(/emptyScope/);
    expect(fn).toMatch(/dateFrom:\s*span\.dateFrom/);
    expect(fn).toMatch(/dateTo:\s*span\.dateTo/);
  });

  it('useTaskCenter sinks listDateFrom/listDateTo + windowLabel', async () => {
    const src = await readFile(
      path.join(webRoot, 'features', 'task-center', 'composables', 'useTaskCenter.ts'),
      'utf8'
    );
    expect(src).toMatch(/listDateFrom\s*=\s*ref/);
    expect(src).toMatch(/listDateTo\s*=\s*ref/);
    expect(src).toMatch(/windowLabel\s*=\s*computed/);
    expect(src).toMatch(/listDateFrom\.value\s*=\s*data\.dateFrom/);
    expect(src).toMatch(/listDateTo\.value\s*=\s*data\.dateTo/);
    expect(src).toMatch(/listDateFrom,/);
    expect(src).toMatch(/listDateTo,/);
    expect(src).toMatch(/windowLabel/);
  });

  it('TaskCenterView shows the creation window + list-window-hint', async () => {
    const src = await readFile(path.join(webRoot, 'views', 'TaskCenterView.vue'), 'utf8');
    expect(src).toMatch(/<h2>任务中心<\/h2>/);
    expect(src).toMatch(/创建时间范围：\{\{\s*windowLabel\s*\}\}/);
    expect(src).toMatch(/list-window-hint/);
    expect(src).toMatch(/listDateFrom/);
    expect(src).toMatch(/listDateTo/);
    expect(src).toMatch(/仅展示/);
    expect(src).toMatch(/windowLabel/);
  });

  it('task-center.css styles list-window-hint', async () => {
    const src = await readFile(path.join(webRoot, 'styles', 'views', 'task-center.css'), 'utf8');
    expect(src).toMatch(/\.list-window-hint\s*\{/);
  });
});
