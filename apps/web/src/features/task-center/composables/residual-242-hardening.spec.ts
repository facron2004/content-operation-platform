import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');

describe('residual #242 fail path evidenceUrl', () => {
  it('failTask client accepts evidenceUrl', async () => {
    const src = await readFile(path.join(srcRoot, 'services/api/task.api.ts'), 'utf8');
    const failStart = src.indexOf('export async function failTask');
    expect(failStart).toBeGreaterThan(-1);
    const failBody = src.slice(failStart, failStart + 400);
    expect(failBody).toMatch(/evidenceUrl\?:/);
    expect(failBody).toMatch(/failReason:\s*string/);
  });

  it('TaskFailDialog collects + emits evidenceUrl (publish parity)', async () => {
    const src = await readFile(path.join(__dirname, '../components/TaskFailDialog.vue'), 'utf8');
    expect(src).toMatch(/form\.evidenceUrl/);
    expect(src).toMatch(/凭证链接/);
    expect(src).toMatch(/evidenceUrl:\s*form\.evidenceUrl\.trim\(\)\s*\|\|\s*undefined/);
    expect(src).toMatch(/pattern:\s*\/\^https\?:\\\/\\\/\.\+\/i/);
  });

  it('useTaskDetail fail accepts evidenceUrl', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskDetail.ts'), 'utf8');
    expect(src).toMatch(/async function fail\(data:\s*\{[\s\S]{0,200}evidenceUrl\?:/);
  });

  it('TaskCenterView + TaskDetailView confirmFail type includes evidenceUrl', async () => {
    const center = await readFile(path.join(srcRoot, 'views/TaskCenterView.vue'), 'utf8');
    expect(center).toMatch(/confirmFail\(data:\s*\{[\s\S]{0,200}evidenceUrl\?:/);

    const detail = await readFile(path.join(srcRoot, 'views/TaskDetailView.vue'), 'utf8');
    expect(detail).toMatch(/confirmFail\(data:\s*\{[\s\S]{0,200}evidenceUrl\?:/);
  });

  it('FailTaskDto already accepts evidenceUrl (API ready)', async () => {
    const dtoPath = path.resolve(
      __dirname,
      '../../../../../../apps/api/src/distribution-task/dto/fail-task.dto.ts'
    );
    const src = await readFile(dtoPath, 'utf8');
    expect(src).toMatch(/evidenceUrl\?:/);
  });
});
