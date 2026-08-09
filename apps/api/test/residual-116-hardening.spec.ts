import { describe, expect, it } from 'vitest';

describe('residual #116 DT status-mutate success without executions', () => {
  it('canonical status commands hydrate via RETURNING (not getById)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );
    const publish = await fs.readFile(
      path.join(
        __dirname,
        '..',
        'src',
        'distribution-task',
        'application',
        'publish-task.service.ts'
      ),
      'utf8'
    );
    const cancel = await fs.readFile(
      path.join(
        __dirname,
        '..',
        'src',
        'distribution-task',
        'application',
        'cancel-task.service.ts'
      ),
      'utf8'
    );
    const machine = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'domain', 'task-status-machine.ts'),
      'utf8'
    );

    expect(src).not.toMatch(/(?:PublishTaskService|CancelTaskService)/);
    expect(src).not.toMatch(/\n\s{2}async (?:publish|fail|cancel|schedule|complete|reassign)\(/);
    expect(publish).toMatch(/transitionPublished\(/);
    expect(publish).toMatch(/transitionFail\(/);
    expect(publish).toMatch(/return parseTask\(returned, \{ includeTrackingCode: false \}\)/);
    expect(cancel).toMatch(/transitionCancel\(/);
    expect(cancel).toMatch(/transitionComplete\(/);
    expect(cancel).toMatch(/transitionReassign\(/);
    expect(cancel).toMatch(/return parseTask\(returned, \{ includeTrackingCode: false \}\)/);
    expect(machine).toMatch(/RETURNING \$\{TASK_STATUS_MUTATE_COLUMNS\}/);
    for (const command of [publish, cancel]) {
      expect(command).not.toMatch(/return this\.getById\(id\)/);
      expect(command).not.toMatch(/return this\.getTaskRow\(id\)/);
    }
  });

  it('GET detail getById still loads executions timeline', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task-read.ts'),
      'utf8'
    );

    const getByIdStart = src.indexOf('export async function getDistributionTaskById(');
    expect(getByIdStart).toBeGreaterThan(0);
    const getById = src.slice(getByIdStart, getByIdStart + 500);
    expect(getById).toMatch(/getDistributionTaskRow\(prisma, id\)/);
    expect(getById).toMatch(/executionService\.findByTaskId/);
  });
});
