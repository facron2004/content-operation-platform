import { describe, expect, it } from 'vitest';

describe('residual #146 DT status-mutate slim RETURNING', () => {
  it('exports TASK_STATUS_MUTATE_COLUMNS as list shell (no body/cta/trackingCode)', async () => {
    const mod = await import('../src/distribution-task/distribution-task-query');
    expect(typeof mod.TASK_STATUS_MUTATE_COLUMNS).toBe('string');
    expect(mod.TASK_STATUS_MUTATE_COLUMNS).toContain('"taskId"');
    expect(mod.TASK_STATUS_MUTATE_COLUMNS).toContain('"status"');
    expect(mod.TASK_STATUS_MUTATE_COLUMNS).toContain('"assigneeId"');
    expect(mod.TASK_STATUS_MUTATE_COLUMNS).not.toContain('"body"');
    expect(mod.TASK_STATUS_MUTATE_COLUMNS).not.toContain('"cta"');
    expect(mod.TASK_STATUS_MUTATE_COLUMNS).not.toContain('"trackingCode"');
    expect(mod.TASK_STATUS_MUTATE_COLUMNS).not.toContain('"idempotencyKey"');
    // Alias of list columns so list/status stay in lockstep.
    expect(mod.TASK_STATUS_MUTATE_COLUMNS).toBe(mod.TASK_LIST_ROW_COLUMNS);
  });

  it('all status mutators (incl. publish/schedule) RETURN list shell', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task.service.ts'),
      'utf8'
    );

    // Residual #146 + #173: every status mutator ships list shell only.
    for (const fnName of [
      'async fail(',
      'async cancel(',
      'async complete(',
      'async reassign(',
      'async publish(',
      'async schedule('
    ] as const) {
      const fnStart = src.indexOf(fnName);
      expect(fnStart).toBeGreaterThan(0);
      const candidates = [
        src.indexOf('\n  async ', fnStart + 10),
        src.indexOf('\n  /**', fnStart + 10),
        src.indexOf('\n  private ', fnStart + 10)
      ].filter((i) => i > 0);
      const next = candidates.length ? Math.min(...candidates) : fnStart + 1500;
      const fn = src.slice(fnStart, next);

      expect(fn).toMatch(/RETURNING \$\{TASK_STATUS_MUTATE_COLUMNS\}/);
      expect(fn).not.toMatch(/RETURNING \$\{TASK_ROW_COLUMNS\}/);
      expect(fn).toMatch(/includeTrackingCode: false/);
      expect(fn).not.toMatch(/includeTrackingCode: true/);
    }

    // Residual #165: update is slim shell (no RETURNING free-form).
    {
      const fnStart = src.indexOf('async update(');
      expect(fnStart).toBeGreaterThan(0);
      const candidates = [
        src.indexOf('\n  async ', fnStart + 10),
        src.indexOf('\n  /**', fnStart + 10),
        src.indexOf('\n  private ', fnStart + 10)
      ].filter((i) => i > 0);
      const next = candidates.length ? Math.min(...candidates) : fnStart + 2500;
      const fn = src.slice(fnStart, next);

      expect(fn).toMatch(/\$executeRawUnsafe/);
      expect(fn).not.toMatch(/\bRETURNING\b/);
      expect(fn).toMatch(/success:\s*true/);
    }
  });
});
