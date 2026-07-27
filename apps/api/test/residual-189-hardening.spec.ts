import { describe, expect, it } from 'vitest';

describe('residual #189 task list channel/priority/keyword filters', () => {
  it('TaskQueryDto declares channel / priority / keyword', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'dto', 'task-query.dto.ts'),
      'utf8'
    );

    expect(src).toMatch(/channel\?:/);
    expect(src).toMatch(/priority\?:/);
    expect(src).toMatch(/keyword\?:/);
    expect(src).toMatch(/wechat_group/);
    expect(src).toMatch(/urgent/);
    expect(src).toMatch(/MaxLength\(100\)/);
  });

  it('listTasks applies channel / priority / keyword SQL branches', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task-query.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('export async function listTasks(');
    expect(fnStart).toBeGreaterThan(0);
    const next = src.indexOf('\nexport ', fnStart + 10);
    const fn = src.slice(fnStart, next > 0 ? next : fnStart + 4000);

    expect(fn).toMatch(/query\.channel/);
    expect(fn).toMatch(/t\."channel"\s*=\s*\?/);
    expect(fn).toMatch(/query\.priority/);
    expect(fn).toMatch(/t\."priority"\s*=\s*\?/);
    expect(fn).toMatch(/query\.keyword/);
    expect(fn).toMatch(/likeContains/);
    expect(fn).toMatch(/ESCAPE\s+'\\\\'/);
    expect(fn).toMatch(/t\."title"\s+LIKE/);
    expect(fn).toMatch(/t\."taskId"\s+LIKE/);
  });

  it('SPA listTasks client already sends channel / priority / keyword', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', '..', 'web', 'src', 'services', 'api', 'task.api.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('export async function listTasks');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('export async function getTaskKPIs', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/channel\?/);
    expect(fn).toMatch(/priority\?/);
    expect(fn).toMatch(/keyword\?/);
  });
});
