import { onScopeDispose, ref } from 'vue';

export type IamMutationAction = () => Promise<unknown>;

/** Owns duplicate-submit, invalidation, and Vue-scope protection for IAM writes. */
export function useIamMutation() {
  const saving = ref(false);
  let latestRequestId = 0;
  let disposed = false;

  function invalidate() {
    latestRequestId += 1;
    saving.value = false;
  }

  onScopeDispose(() => {
    disposed = true;
    invalidate();
  }, true);

  async function run(action: IamMutationAction): Promise<boolean> {
    if (disposed || saving.value) return false;

    const requestId = ++latestRequestId;
    saving.value = true;
    try {
      await action();
      return !disposed && requestId === latestRequestId;
    } catch (error) {
      if (disposed || requestId !== latestRequestId) return false;
      throw error;
    } finally {
      if (requestId === latestRequestId) saving.value = false;
    }
  }

  return { saving, run, invalidate };
}
