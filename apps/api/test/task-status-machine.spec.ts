import { describe, it, expect } from 'vitest';
import {
  canTransition,
  assertTransition,
  isTerminal,
  DELETABLE_STATUSES
} from '../src/distribution-task/domain/task-status-machine';

describe('Task Status Machine Domain Rules', () => {
  it('allows valid state transitions', () => {
    expect(canTransition('draft', 'waiting_audit')).toBe(true);
    expect(canTransition('draft', 'scheduled')).toBe(true);
    expect(canTransition('waiting_audit', 'scheduled')).toBe(true);
    expect(canTransition('scheduled', 'published')).toBe(true);
    expect(canTransition('published', 'completed')).toBe(true);
  });

  it('rejects invalid state transitions', () => {
    expect(canTransition('draft', 'completed')).toBe(false);
    expect(canTransition('completed', 'draft')).toBe(false);
    expect(canTransition('cancelled', 'published')).toBe(false);

    expect(() => assertTransition('draft', 'completed')).toThrow(/Cannot transition/);
  });

  it('identifies terminal statuses correctly', () => {
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('draft')).toBe(false);
    expect(isTerminal('published')).toBe(false);
  });

  it('enforces deletable status rules', () => {
    expect(DELETABLE_STATUSES.has('draft')).toBe(true);
    expect(DELETABLE_STATUSES.has('cancelled')).toBe(true);
    expect(DELETABLE_STATUSES.has('published')).toBe(false);
    expect(DELETABLE_STATUSES.has('completed')).toBe(false);
  });
});
