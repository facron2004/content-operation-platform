import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// composables → task-center → features → src
const srcRoot = path.resolve(__dirname, '../../..');
const sharedRoot = path.resolve(srcRoot, '../../../packages/shared/src');

describe('residual #260 execution timeline LIMIT honesty', () => {
  it('API findByTaskId returns items + truncated/limit (SKU #250 parity)', async () => {
    const src = await readFile(
      path.resolve(
        __dirname,
        '../../../../../../apps/api/src/distribution-task/distribution-execution.service.ts'
      ),
      'utf8'
    );
    expect(src).toMatch(/EXECUTION_TIMELINE_LIMIT/);
    expect(src).toMatch(/truncated:\s*items\.length\s*>=\s*EXECUTION_TIMELINE_LIMIT/);
    expect(src).toMatch(/limit:\s*EXECUTION_TIMELINE_LIMIT/);
    expect(src).toMatch(/items,/);
  });

  it('API getById projects executionsTruncated / executionsLimit', async () => {
    const src = await readFile(
      path.resolve(
        __dirname,
        '../../../../../../apps/api/src/distribution-task/distribution-task.service.ts'
      ),
      'utf8'
    );
    const getStart = src.indexOf('async getById');
    expect(getStart).toBeGreaterThanOrEqual(0);
    const getEnd = src.indexOf('async getTaskRow', getStart + 10);
    const getFn = src.slice(getStart, getEnd > 0 ? getEnd : getStart + 800);
    expect(getFn).toMatch(/executions:\s*timeline\.items/);
    expect(getFn).toMatch(/executionsTruncated:\s*timeline\.truncated/);
    expect(getFn).toMatch(/executionsLimit:\s*timeline\.limit/);
  });

  it('shared TaskDetailResponse declares honesty fields', async () => {
    const shared = await readFile(path.join(sharedRoot, 'api-campaign-types.ts'), 'utf8');
    const start = shared.indexOf('export interface TaskDetailResponse');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = shared.indexOf('export interface CampaignListResponse', start + 10);
    const block = shared.slice(start, end > 0 ? end : undefined);
    expect(block).toMatch(/executionsTruncated\?:/);
    expect(block).toMatch(/executionsLimit\?:/);
  });

  it('useTaskDetail tracks executionsTruncated / executionsLimit', async () => {
    const src = await readFile(path.join(__dirname, 'useTaskDetail.ts'), 'utf8');
    expect(src).toMatch(/executionsTruncated\s*=\s*ref\(false\)/);
    expect(src).toMatch(/executionsLimit\s*=\s*ref<\s*number\s*\|\s*null\s*>\(null\)/);
    expect(src).toMatch(/applyTimelineMeta/);
    expect(src).toMatch(/detail\.executionsTruncated/);
    expect(src).toMatch(/detail\.executionsLimit/);
  });

  it('TaskExecutionTimeline shows cap hint when truncated', async () => {
    const src = await readFile(
      path.join(__dirname, '../components/TaskExecutionTimeline.vue'),
      'utf8'
    );
    expect(src).toMatch(/truncated\?:/);
    expect(src).toMatch(/limit\?:/);
    expect(src).toMatch(/timeline-cap-hint/);
    expect(src).toMatch(/仅展示最早/);
  });

  it('TaskDetailView wires honesty props into timeline', async () => {
    const src = await readFile(path.join(srcRoot, 'views/TaskDetailView.vue'), 'utf8');
    expect(src).toMatch(/:truncated="executionsTruncated"/);
    expect(src).toMatch(/:limit="executionsLimit"/);
    expect(src).toMatch(/executionsTruncated/);
    expect(src).toMatch(/executionsLimit/);
  });
});
