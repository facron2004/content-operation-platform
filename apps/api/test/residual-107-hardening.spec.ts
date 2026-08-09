import { describe, expect, it } from 'vitest';

describe('residual #107 distribution-task mutate drop executions / status-only', () => {
  it('exposes task row/delete meta helpers and canonical status probes', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );
    const read = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task-read.ts'),
      'utf8'
    );
    const repository = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'repositories', 'task.repository.ts'),
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

    // Residual #156: getTaskRow is public so controller can scope + preload.
    // Residual #159: getTaskDeleteMeta is public (packageId+status+publishedAt).
    expect(src).toMatch(/async getTaskRow\(/);
    expect(src).toMatch(/async getTaskDeleteMeta\(/);
    expect(src).not.toMatch(/(?:PublishTaskService|CancelTaskService)/);
    expect(src).not.toMatch(/\n\s{2}async (?:publish|fail|cancel|schedule|complete|reassign)\(/);
    expect(src).not.toMatch(/\n\s{2}async (?:create|batchCreate)\(/);
    expect(publish).toMatch(/getStatus\(this\.prisma, id\)/);
    expect(cancel).toMatch(/getStatus\(this\.prisma, id\)/);
    expect(read).toMatch(/getDeleteMeta\(prisma, id\)/);
    expect(read).toMatch(/getUpdateMeta\(prisma, id\)/);
    expect(repository).toMatch(/t\."packageId", t\."status", t\."publishedAt"/);
    expect(repository).toMatch(/LEFT JOIN "ContentPackage"/);
    // getById still loads executions for detail responses.
    const getByIdStart = read.indexOf('export async function getDistributionTaskById(');
    expect(getByIdStart).toBeGreaterThan(0);
    const next = read.indexOf('\nexport ', getByIdStart + 10);
    const getById = read.slice(getByIdStart, next > 0 ? next : getByIdStart + 500);
    expect(getById).toMatch(/executionService\.findByTaskId/);
  });

  it('legacy query service does not retain status command wrappers', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/this\.(?:publish|cancel)TaskService\./);
    expect(src).not.toMatch(/\n\s{2}async (?:publish|fail|cancel|schedule|complete|reassign)\(/);
  });

  it('canonical publish/schedule commands use narrow preloads; delete keeps delete meta', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );
    const updateService = await fs.readFile(
      path.join(
        __dirname,
        '..',
        'src',
        'distribution-task',
        'application',
        'update-task.service.ts'
      ),
      'utf8'
    );
    const deleteService = await fs.readFile(
      path.join(
        __dirname,
        '..',
        'src',
        'distribution-task',
        'application',
        'delete-task.service.ts'
      ),
      'utf8'
    );
    const repository = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'repositories', 'task.repository.ts'),
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
    const controller = await fs.readFile(
      path.join(
        __dirname,
        '..',
        'src',
        'distribution-task',
        'distribution-task-command.controller.ts'
      ),
      'utf8'
    );

    // Residual #129: update pre-load is freeze/FK projection (getTaskUpdateMeta).
    // Residual #165: happy path delegates the slim update to the repository (no RETURNING free-form).
    // Residual #153: empty-set short-circuit synthesizes shell (no getTaskRow re-SELECT).
    // Residual #156: optional preloadedMeta falls back to getTaskUpdateMeta.
    const updateStart = updateService.indexOf('export async function updateDistributionTask(');
    expect(updateStart).toBeGreaterThan(0);
    const updateCandidates = [
      updateService.indexOf('\nexport ', updateStart + 10),
      updateService.indexOf('\n@Injectable', updateStart + 10)
    ].filter((i) => i > 0);
    const updateNext = updateCandidates.length ? Math.min(...updateCandidates) : updateStart + 2500;
    const updateFn = updateService.slice(updateStart, updateNext);
    expect(updateFn).toMatch(/getDistributionTaskUpdateMeta\(/);
    expect(updateFn).toMatch(
      /preloadedMeta \?\? \(await getDistributionTaskUpdateMeta\(prisma, id\)\)/
    );
    expect(updateFn).toMatch(/if \(sets\.length === 0\)/);
    expect(updateFn).not.toMatch(/if \(sets\.length === 0\) return this\.getTaskRow\(id\)/);
    expect(updateFn).not.toMatch(/return this\.getTaskRow\(id\)/);
    expect(updateFn).toMatch(/updateTask\(prisma, id, sets, params, existing\.status\)/);
    expect(updateFn).not.toMatch(/\bRETURNING\b/);
    expect(repository).toMatch(/UPDATE "DistributionTask" SET \$\{sets\.join\(', '\)\}/);
    expect(repository).not.toMatch(/\bRETURNING\b/);
    expect(updateFn).toMatch(/success:\s*true/);
    expect(updateFn).not.toMatch(/const (existing|task) = await this\.getById\(id\)/);
    expect(updateFn).not.toMatch(/const existing = await this\.getTaskRow\(id\)/);

    expect(src).not.toMatch(/this\.(?:publish|cancel)TaskService\./);
    expect(src).not.toMatch(/\n\s{2}async (?:create|batchCreate)\(/);
    expect(controller).toMatch(/@Inject\(CreateTaskService\)/);
    expect(controller).toMatch(/return this\.createSvc\.create\(/);
    expect(controller).toMatch(/return this\.createSvc\.batchCreate\(/);
    expect(controller).toMatch(/@Inject\(PublishTaskService\)/);
    expect(controller).toMatch(/@Inject\(CancelTaskService\)/);
    expect(controller).toMatch(/return this\.publishSvc\.publish\(/);
    expect(controller).toMatch(/return this\.cancelSvc\.schedule\(/);
    expect(publish).toMatch(/prepublishLoad\(id\)/);
    expect(publish).toMatch(/transitionPublished\(/);
    expect(publish).toMatch(/return parseTask\(returned, \{ includeTrackingCode: false \}\)/);
    expect(publish).not.toMatch(/return this\.getById\(id\)/);
    expect(cancel).toMatch(/loadScheduleTask\(id\)/);
    expect(cancel).toMatch(/transitionSchedule\(/);
    expect(cancel).toMatch(/return parseTask\(returned, \{ includeTrackingCode: false \}\)/);
    expect(cancel).not.toMatch(/return this\.getById\(id\)/);

    // Residual #159: optional preloadedMeta; fallback getTaskDeleteMeta.
    const delStart = deleteService.indexOf('export async function deleteDistributionTask(');
    expect(delStart).toBeGreaterThan(0);
    const delNextCandidates = [
      deleteService.indexOf('\nexport ', delStart + 10),
      deleteService.indexOf('\n@Injectable', delStart + 10)
    ].filter((i) => i > 0);
    const delNext = delNextCandidates.length ? Math.min(...delNextCandidates) : delStart + 1200;
    const del = deleteService.slice(delStart, delNext);
    expect(del).toMatch(/preloadedMeta \?\? \(await getDistributionTaskDeleteMeta\(prisma, id\)\)/);
    expect(del).toMatch(/deleteTask\(prisma, id, task\.status\)/);
    expect(del).not.toMatch(/await this\.getById\(id\)/);
  });
});
