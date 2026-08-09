import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → community-library → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #186 community detail nested tasks', () => {
  it('community-library.api exposes getCommunityTasks', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/community-library.api.ts'), 'utf8');
    expect(src).toMatch(/export async function getCommunityTasks/);
    expect(src).toMatch(/\/community-library\/\$\{encodeURIComponent\(id\)\}\/tasks/);
  });

  it('useCommunityDetail open also fetches getCommunityTasks', async () => {
    const src = await readFile(path.join(__dirname, 'useCommunityDetail.ts'), 'utf8');
    expect(src).toMatch(/api\.getCommunityTasks\s*\(/);
    expect(src).toMatch(/api\.getCommunity\s*\(/);
    expect(src).toMatch(/api\.getCommunityPerformance\s*\(/);
    expect(src).toMatch(/Promise\.all/);
    // Promise.allSettled keeps task failures independent from the other detail domains.
    expect(src).toMatch(/Promise\.allSettled/);
    expect(src).toMatch(/tasksError\.value/);
    expect(src).toMatch(/tasks\.value/);
    expect(src).toMatch(/tasksTotal\.value/);
  });

  it('CommunityDetailCard renders tasks table + status tags', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/CommunityDetailCard.vue'),
      'utf8'
    );
    expect(src).toMatch(/tasks-section/);
    expect(src).toMatch(/TaskStatusTag/);
    expect(src).toMatch(/props\.tasks|tasks\?:/);
    expect(src).toMatch(/tasksTotal/);
    // Links out to task center / detail.
    expect(src).toMatch(/goTaskCenter|name:\s*['"]tasks['"]/);
    expect(src).toMatch(/goTask|task-detail/);
  });

  it('CommunityLibraryView wires tasks props into detail card', async () => {
    const src = await readFile(path.join(srcRoot, 'views/CommunityLibraryView.vue'), 'utf8');
    expect(src).toMatch(/:tasks="detailTasks"/);
    expect(src).toMatch(/:tasks-total="detailTasksTotal"/);
    expect(src).toMatch(/:tasks-loading="detailTasksLoading"/);
    expect(src).toMatch(/tasks:\s*detailTasks/);
  });
});
