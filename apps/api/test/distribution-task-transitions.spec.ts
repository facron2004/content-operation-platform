import { describe, expect, it } from 'vitest';
import {
  VALID_TRANSITIONS,
  canTransition
} from '../src/distribution-task/distribution-task-transitions';

describe('distribution-task transitions', () => {
  it('allows scheduled -> published and scheduled -> failed', () => {
    expect(canTransition('scheduled', 'published')).toBe(true);
    expect(canTransition('scheduled', 'failed')).toBe(true);
    expect(canTransition('scheduled', 'cancelled')).toBe(true);
  });

  it('rejects illegal transitions from terminal states', () => {
    expect(canTransition('completed', 'published')).toBe(false);
    expect(canTransition('failed', 'scheduled')).toBe(false);
    expect(canTransition('cancelled', 'draft')).toBe(false);
  });

  it('allows cancel from statuses that list cancelled', () => {
    for (const [from, allowed] of Object.entries(VALID_TRANSITIONS)) {
      if (allowed.includes('cancelled')) {
        expect(canTransition(from, 'cancelled')).toBe(true);
      } else {
        expect(canTransition(from, 'cancelled')).toBe(false);
      }
    }
  });

  it('returns false for unknown from-status', () => {
    expect(canTransition('unknown_status', 'published')).toBe(false);
  });
});
