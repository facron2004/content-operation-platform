import { nextTick, onScopeDispose, watch, type Ref } from 'vue';

type BackfillEventTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

export function useBackfillMenuLifecycle(params: {
  open: Ref<boolean>;
  position: () => void;
  onKey: (event: KeyboardEvent) => void;
  eventTarget?: BackfillEventTarget;
}) {
  const eventTarget = params.eventTarget ?? window;
  let disposed = false;
  let openGeneration = 0;

  const removeGlobalListeners = () => {
    eventTarget.removeEventListener('resize', params.position);
    eventTarget.removeEventListener('scroll', params.position, true);
    eventTarget.removeEventListener('keydown', params.onKey);
  };

  const addGlobalListeners = () => {
    eventTarget.addEventListener('resize', params.position);
    eventTarget.addEventListener('scroll', params.position, true);
    eventTarget.addEventListener('keydown', params.onKey);
  };

  watch(params.open, (isOpen) => {
    const generation = ++openGeneration;
    if (!isOpen) {
      removeGlobalListeners();
      return;
    }

    void nextTick().then(() => {
      if (disposed || !params.open.value || generation !== openGeneration) return;
      params.position();
      addGlobalListeners();
    });
  });

  onScopeDispose(() => {
    disposed = true;
    openGeneration += 1;
    removeGlobalListeners();
  }, true);
}
