import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '../src');

describe('residual #247 task list packageId filter', () => {
  it('TaskQueryDto declares packageId', async () => {
    const src = await readFile(
      path.join(srcRoot, 'distribution-task/dto/task-query.dto.ts'),
      'utf8'
    );
    expect(src).toMatch(/packageId\?:/);
    expect(src).toMatch(/@MaxLength\(64\)[\s\S]{0,40}packageId/);
  });

  it('listTasks SQL applies exact packageId branch', async () => {
    const src = await readFile(
      path.join(srcRoot, 'distribution-task/distribution-task-query.ts'),
      'utf8'
    );
    expect(src).toMatch(/query\.packageId/);
    expect(src).toMatch(/t\."packageId"\s*=\s*\?/);
  });

  it('SPA listTasks client accepts packageId', async () => {
    const src = await readFile(
      path.resolve(__dirname, '../../web/src/services/api/task.api.ts'),
      'utf8'
    );
    const fnStart = src.indexOf('export async function listTasks');
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const fnEnd = src.indexOf('export async function getTaskKPIs', fnStart + 10);
    const fn = src.slice(fnStart, fnEnd > 0 ? fnEnd : undefined);
    expect(fn).toMatch(/packageId\?/);
  });

  it('useTaskCenter seeds + forwards packageId (not keyword)', async () => {
    const src = await readFile(
      path.resolve(__dirname, '../../web/src/features/task-center/composables/useTaskCenter.ts'),
      'utf8'
    );
    expect(src).toMatch(/packageId:\s*string/);
    expect(src).toMatch(/seed\.packageId\s*=\s*packageId/);
    expect(src).not.toMatch(/seed\.keyword\s*=\s*packageId/);
    expect(src).toMatch(/packageId:\s*filters\.packageId/);
  });
});
