import { effectScope, type EffectScope } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useIamAccessMutation,
  type IamAccessMutationPayload,
  type IamAccessMutationSource
} from './useIamAccessMutation';

const payload: IamAccessMutationPayload = {
  assignments: [{ roleCode: 'operator', scopeType: 'ORG_ONLY', orgUnitId: 'org-hq' }],
  organizationUnitIds: ['org-hq'],
  primaryOrgUnitId: 'org-hq'
};

type Deferred = {
  promise: Promise<unknown>;
  resolve: () => void;
};

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('IAM access mutation lifecycle', () => {
  let scope: EffectScope | undefined;

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('blocks duplicate saves while the first request is pending', async () => {
    const deferred = createDeferred();
    const source: IamAccessMutationSource = {
      replaceIamUserAccess: vi.fn(() => deferred.promise)
    };
    let mutation!: ReturnType<typeof useIamAccessMutation>;
    scope = effectScope();
    scope.run(() => {
      mutation = useIamAccessMutation(source);
    });

    const first = mutation.save('user-a', payload);
    const duplicate = mutation.save('user-a', payload);

    await expect(duplicate).resolves.toBe(false);
    expect(source.replaceIamUserAccess).toHaveBeenCalledTimes(1);
    expect(mutation.saving.value).toBe(true);

    deferred.resolve();
    await expect(first).resolves.toBe(true);
    expect(mutation.saving.value).toBe(false);
  });

  it('drops a late save result after invalidation or scope disposal', async () => {
    const deferred = createDeferred();
    const source: IamAccessMutationSource = {
      replaceIamUserAccess: vi.fn(() => deferred.promise)
    };
    let mutation!: ReturnType<typeof useIamAccessMutation>;
    scope = effectScope();
    scope.run(() => {
      mutation = useIamAccessMutation(source);
    });

    const pending = mutation.save('user-a', payload);
    mutation.invalidate();
    deferred.resolve();

    await expect(pending).resolves.toBe(false);
    expect(mutation.saving.value).toBe(false);

    const disposedDeferred = createDeferred();
    source.replaceIamUserAccess = vi.fn(() => disposedDeferred.promise);
    const afterRestart = mutation.save('user-a', payload);
    scope.stop();
    disposedDeferred.resolve();

    await expect(afterRestart).resolves.toBe(false);
  });
});
