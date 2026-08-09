import { describe, expect, it } from 'vitest';

describe('residual #159 DT delete packageId + delete-meta fold', () => {
  it('getTaskDeleteMeta stays public while repository owns the meta SELECT', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task-read.ts'),
      'utf8'
    );
    const repository = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'repositories', 'task.repository.ts'),
      'utf8'
    );

    const fnStart = src.indexOf('export async function getDistributionTaskDeleteMeta(');
    expect(fnStart).toBeGreaterThan(0);
    expect(src.slice(Math.max(0, fnStart - 20), fnStart)).not.toMatch(/private\s+$/);
    const fn = src.slice(fnStart, fnStart + 400);
    expect(fn).toMatch(/getDeleteMeta\(prisma, id\)/);
    expect(fn).toMatch(/NotFoundException/);
    const repoStart = repository.indexOf('export async function getDeleteMeta(');
    expect(repoStart).toBeGreaterThan(0);
    const repoFn = repository.slice(repoStart, repoStart + 1100);
    expect(repoFn).toMatch(/t\."packageId"/);
    expect(repoFn).toMatch(/t\."status"/);
    expect(repoFn).toMatch(/t\."publishedAt"/);
    expect(repoFn).toMatch(/LEFT JOIN "ContentPackage"/);
    expect(repoFn).toMatch(/packageGeo/);
  });

  it('delete accepts preloadedMeta; controller passes delete meta', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const service = await fs.readFile(
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

    const delStart = service.indexOf('export async function deleteDistributionTask(');
    expect(delStart).toBeGreaterThan(0);
    const candidates = [
      service.indexOf('\nexport ', delStart + 10),
      service.indexOf('\n@Injectable', delStart + 10)
    ].filter((i) => i > 0);
    const del = service.slice(
      delStart,
      candidates.length ? Math.min(...candidates) : delStart + 1500
    );
    expect(del).toMatch(/preloadedMeta\?/);
    expect(del).toMatch(/preloadedMeta \?\? \(await getDistributionTaskDeleteMeta\(prisma, id\)\)/);
    expect(del).toMatch(/deleteTask\(prisma, id, task\.status\)/);
    // Failure arm still re-probes delete meta.
    expect(del).toMatch(/const latest = await getDistributionTaskDeleteMeta\(prisma, id\)/);
    expect(del).toMatch(/return \{ success: true \}/);

    const cStart = controller.search(/async delete\(\s*@Param/);
    expect(cStart).toBeGreaterThan(0);
    const nextRoles = controller.indexOf('\n  @Roles(', cStart + 10);
    const nextGet = controller.indexOf('\n  @Get(', cStart + 10);
    const nextPrivate = controller.indexOf('\n  private ', cStart + 10);
    const cCandidates = [nextRoles, nextGet, nextPrivate].filter((i) => i > 0);
    const cFn = controller.slice(
      cStart,
      cCandidates.length ? Math.min(...cCandidates) : cStart + 500
    );
    expect(cFn).toMatch(/getTaskDeleteMeta\(safeId\)/);
    expect(cFn).toMatch(/assertTaskAccess\((?:this\.prisma,\s*)?meta\.packageId/);
    expect(cFn).toMatch(/this\.deleteSvc\.delete\(safeId, meta\)/);
    expect(cFn).not.toMatch(/getTaskPackageId/);
    expect(cFn).not.toMatch(/getById/);
  });
});
