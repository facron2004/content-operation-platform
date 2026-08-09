import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, type EffectScope } from 'vue';
import { useBackfillMenuLifecycle } from './useBackfillMenu';

function createEventTarget() {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  } as unknown as Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

describe('useBackfillMenuLifecycle', () => {
  let scope: EffectScope | undefined;

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('does not add listeners after the scope is disposed during nextTick', async () => {
    const open = ref(false);
    const eventTarget = createEventTarget();
    const position = vi.fn();
    scope = effectScope();
    scope.run(() =>
      useBackfillMenuLifecycle({
        open,
        position,
        onKey: vi.fn(),
        eventTarget
      })
    );

    open.value = true;
    await Promise.resolve();
    scope.stop();
    await Promise.resolve();

    expect(position).not.toHaveBeenCalled();
    expect(eventTarget.addEventListener).not.toHaveBeenCalled();
  });

  it('cancels a pending open when the menu closes before nextTick', async () => {
    const open = ref(false);
    const eventTarget = createEventTarget();
    const position = vi.fn();
    scope = effectScope();
    scope.run(() =>
      useBackfillMenuLifecycle({
        open,
        position,
        onKey: vi.fn(),
        eventTarget
      })
    );

    open.value = true;
    await Promise.resolve();
    open.value = false;
    await Promise.resolve();
    await Promise.resolve();

    expect(position).not.toHaveBeenCalled();
    expect(eventTarget.addEventListener).not.toHaveBeenCalled();
  });

  it('adds and removes the three global listeners for an open menu', async () => {
    const open = ref(false);
    const eventTarget = createEventTarget();
    const position = vi.fn();
    const onKey = vi.fn();
    scope = effectScope();
    scope.run(() =>
      useBackfillMenuLifecycle({
        open,
        position,
        onKey,
        eventTarget
      })
    );

    open.value = true;
    await Promise.resolve();
    await Promise.resolve();

    expect(position).toHaveBeenCalledTimes(1);
    expect(eventTarget.addEventListener).toHaveBeenCalledTimes(3);

    open.value = false;
    await Promise.resolve();

    expect(eventTarget.removeEventListener).toHaveBeenCalledTimes(3);
  });
});
