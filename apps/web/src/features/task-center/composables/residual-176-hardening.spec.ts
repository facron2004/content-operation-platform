import { describe, expect, it } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webSrc = path.join(__dirname, '..', '..', '..');

describe('residual #176 publish/fail gates match API transitions', () => {
  it('TaskListTable PUBLISHABLE/FAILABLE are scheduled-only', async () => {
    const src = await readFile(
      path.join(webSrc, 'features', 'task-center', 'components', 'TaskListTable.vue'),
      'utf8'
    );
    // Residual #176: must not offer publish/fail for statuses API will 400.
    expect(src).toMatch(/const PUBLISHABLE:\s*TaskStatus\[\]\s*=\s*\[\s*['"]scheduled['"]\s*\]/);
    expect(src).toMatch(/const FAILABLE:\s*TaskStatus\[\]\s*=\s*\[\s*['"]scheduled['"]\s*\]/);
    // Must not include draft/waiting_audit on publish or published/overdue on fail.
    expect(src).not.toMatch(/const PUBLISHABLE:\s*TaskStatus\[\]\s*=\s*\[[^\]]*['"]draft['"]/);
    expect(src).not.toMatch(/const FAILABLE:\s*TaskStatus\[\]\s*=\s*\[[^\]]*['"]published['"]/);
    expect(src).not.toMatch(/const FAILABLE:\s*TaskStatus\[\]\s*=\s*\[[^\]]*['"]overdue['"]/);
  });

  it('TaskDetailView canPublish/canFail are scheduled-only', async () => {
    const src = await readFile(path.join(webSrc, 'views', 'TaskDetailView.vue'), 'utf8');
    expect(src).toMatch(
      /const canPublish = computed\(\(\)\s*=>\s*task\.value\?\.status === ['"]scheduled['"]\)/
    );
    expect(src).toMatch(
      /const canFail = computed\(\(\)\s*=>\s*task\.value\?\.status === ['"]scheduled['"]\)/
    );
    // No draft/waiting_audit affordance for publish.
    expect(src).not.toMatch(/canPublish[\s\S]{0,200}['"]draft['"]/);
    expect(src).not.toMatch(/canPublish[\s\S]{0,200}['"]waiting_audit['"]/);
    // No published affordance for fail.
    expect(src).not.toMatch(/canFail[\s\S]{0,120}['"]published['"]/);
  });
});
