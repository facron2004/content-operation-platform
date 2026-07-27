import { describe, expect, it } from 'vitest';

describe('residual #111 dead assertCanTransition removal', () => {
  it('transitions module exports canTransition only (no assertCanTransition)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const src = await fs.readFile(
      path.join(__dirname, '..', 'src', 'distribution-task', 'distribution-task-transitions.ts'),
      'utf8'
    );

    expect(src).toMatch(/export function canTransition\(/);
    expect(src).toMatch(/export const VALID_TRANSITIONS/);
    // Dead helper removed.
    expect(src).not.toMatch(/export function assertCanTransition\(/);
  });
});
