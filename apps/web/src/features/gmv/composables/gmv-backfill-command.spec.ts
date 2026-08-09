import { describe, expect, it, vi } from 'vitest';
import { dispatchGmvBackfillCommand } from './gmv-backfill-command';

describe('GMV backfill command dispatch', () => {
  it('does not close the menu or emit a command while backfilling', () => {
    const close = vi.fn();
    const emit = vi.fn();

    expect(dispatchGmvBackfillCommand(true, 7, close, emit)).toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('closes the menu before emitting an idle backfill command', () => {
    const close = vi.fn();
    const emit = vi.fn();

    expect(dispatchGmvBackfillCommand(false, { startDate: '2026-08-01' }, close, emit)).toBe(true);
    expect(close).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith({ startDate: '2026-08-01' });
  });
});
