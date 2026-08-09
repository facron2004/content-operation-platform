import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import type { GeneratedCopy } from '@content/shared';

const mocks = vi.hoisted(() => ({
  listCopies: vi.fn(),
  getCopy: vi.fn(),
  auditCopy: vi.fn(),
  warning: vi.fn(),
  success: vi.fn()
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return { ...actual, onMounted: () => undefined };
});

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} })
}));

vi.mock('element-plus', () => ({
  ElMessage: {
    warning: mocks.warning,
    success: mocks.success
  }
}));

vi.mock('../../services/api', () => ({
  api: {
    listCopies: mocks.listCopies,
    getCopy: mocks.getCopy,
    auditCopy: mocks.auditCopy
  }
}));

vi.mock('../../services/http-client', () => ({
  extractErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback
}));

import { useAudit } from './use-audit';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function copyFor(contentId: string): GeneratedCopy {
  return {
    contentId,
    packageId: 'package-1',
    areaId: 'area-1',
    merchantId: 'merchant-1',
    channel: 'wechat_group',
    scenario: 'promotion',
    title: contentId,
    body: `${contentId} body`,
    cta: '立即查看',
    copyVersion: 'v1',
    strategyType: 'launch',
    riskLevel: 'low',
    riskTips: [],
    auditStatus: 'pending',
    auditRemark: null,
    createdBy: 'user-1',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z'
  };
}

function listResponse(contentId: string) {
  return {
    items: [copyFor(contentId)],
    pagination: {
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1
    }
  };
}

function createAuditForMutation() {
  mocks.listCopies.mockReset().mockResolvedValue(listResponse('selected'));
  mocks.getCopy.mockReset().mockResolvedValue(copyFor('selected'));
  mocks.auditCopy.mockReset().mockResolvedValue(undefined);
  mocks.warning.mockReset();
  mocks.success.mockReset();
  const mutationScope = effectScope();
  const audit = mutationScope.run(() => useAudit())!;
  audit.selected.value = copyFor('selected');
  audit.draft.title = 'Original title';
  audit.draft.body = 'Original body';
  audit.draft.auditRemark = 'Original remark';
  return { scope: mutationScope, audit };
}

describe('useAudit list request lifecycle', () => {
  let scope: EffectScope | undefined;

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps the latest audit list when an earlier request resolves late', async () => {
    const first = createDeferred<ReturnType<typeof listResponse>>();
    const second = createDeferred<ReturnType<typeof listResponse>>();
    mocks.listCopies
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const audit = scope.run(() => useAudit())!;

    const firstLoad = audit.load();
    const secondLoad = audit.load();
    second.resolve(listResponse('latest'));
    await secondLoad;
    first.resolve(listResponse('stale'));
    await firstLoad;

    expect(audit.copies.value[0]?.contentId).toBe('latest');
    expect(audit.loading.value).toBe(false);
  });

  it('does not let a stale list error disturb the latest successful result', async () => {
    const first = createDeferred<ReturnType<typeof listResponse>>();
    const second = createDeferred<ReturnType<typeof listResponse>>();
    mocks.listCopies
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const audit = scope.run(() => useAudit())!;

    const firstLoad = audit.load();
    const secondLoad = audit.load();
    second.resolve(listResponse('latest'));
    await secondLoad;
    first.reject(new Error('stale failure'));
    await expect(firstLoad).rejects.toThrow('stale failure');

    expect(audit.copies.value[0]?.contentId).toBe('latest');
    expect(audit.loading.value).toBe(false);
  });

  it('exposes the latest list error and clears it after a successful retry', async () => {
    mocks.listCopies
      .mockReset()
      .mockRejectedValueOnce(new Error('queue unavailable'))
      .mockResolvedValueOnce(listResponse('recovered'));
    scope = effectScope();
    const audit = scope.run(() => useAudit())!;

    await expect(audit.load()).rejects.toThrow('queue unavailable');
    expect(audit.loadError.value).toBe('queue unavailable');

    await audit.load();

    expect(audit.copies.value[0]?.contentId).toBe('recovered');
    expect(audit.loadError.value).toBeNull();
  });

  it('keeps the list projection visible when detail loading fails and clears the error on retry', async () => {
    const listProjection = { ...copyFor('selected'), body: 'list projection' };
    const fullCopy = { ...copyFor('selected'), body: 'full detail' };
    mocks.getCopy
      .mockReset()
      .mockRejectedValueOnce(new Error('detail unavailable'))
      .mockResolvedValueOnce(fullCopy);
    scope = effectScope();
    const audit = scope.run(() => useAudit())!;

    await audit.selectCopy(listProjection);

    expect(audit.selected.value?.body).toBe('list projection');
    expect(audit.detailError.value).toBe('detail unavailable');

    await audit.selectCopy(listProjection);

    expect(audit.selected.value?.body).toBe('full detail');
    expect(audit.detailError.value).toBeNull();
  });

  it('keeps audit write failures visible and clears them after a successful retry', async () => {
    const mutation = createAuditForMutation();
    scope = mutation.scope;
    const audit = mutation.audit;
    mocks.auditCopy
      .mockReset()
      .mockRejectedValueOnce(new Error('audit unavailable'))
      .mockResolvedValueOnce(undefined);

    await audit.audit('approved');

    expect(audit.actionError.value).toBe('audit unavailable');
    expect(mocks.listCopies).not.toHaveBeenCalled();

    await audit.audit('approved');

    expect(audit.actionError.value).toBeNull();
    expect(mocks.listCopies).toHaveBeenCalledTimes(1);
  });

  it('ignores late list data and blocks new loads after scope disposal', async () => {
    const pending = createDeferred<ReturnType<typeof listResponse>>();
    mocks.listCopies.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const audit = scope.run(() => useAudit())!;
    const load = audit.load();

    scope.stop();
    pending.resolve(listResponse('late'));
    await load;
    await audit.load();

    expect(audit.copies.value).toEqual([]);
    expect(audit.loading.value).toBe(false);
    expect(mocks.listCopies).toHaveBeenCalledTimes(1);
  });

  it('prevents duplicate audit writes and snapshots the draft payload', async () => {
    const pending = createDeferred<void>();
    const mutation = createAuditForMutation();
    scope = mutation.scope;
    const audit = mutation.audit;
    mocks.auditCopy.mockReset().mockReturnValue(pending.promise);

    const first = audit.audit('approved');
    const duplicate = audit.audit('approved');
    audit.draft.title = 'Changed after submit';

    expect(mocks.auditCopy).toHaveBeenCalledTimes(1);
    expect(audit.submitting.value).toBe(true);
    expect(mocks.auditCopy).toHaveBeenCalledWith('selected', {
      auditStatus: 'approved',
      title: 'Original title',
      body: 'Original body',
      auditRemark: 'Original remark'
    });

    pending.resolve(undefined);
    await first;
    await duplicate;

    expect(mocks.listCopies).toHaveBeenCalledTimes(1);
    expect(audit.submitting.value).toBe(false);
  });

  it('drops a late audit result after switching to another copy', async () => {
    const pending = createDeferred<void>();
    const mutation = createAuditForMutation();
    scope = mutation.scope;
    const audit = mutation.audit;
    mocks.auditCopy.mockReset().mockReturnValue(pending.promise);
    mocks.getCopy.mockReset().mockResolvedValue(copyFor('next'));

    const request = audit.audit('rejected');
    await audit.selectCopy(copyFor('next'));
    pending.reject(new Error('late failure'));
    await request;

    expect(audit.selected.value?.contentId).toBe('next');
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.listCopies).not.toHaveBeenCalled();
    expect(audit.actionError.value).toBeNull();
    expect(audit.submitting.value).toBe(false);
  });

  it('drops a late audit result after scope disposal', async () => {
    const pending = createDeferred<void>();
    const mutation = createAuditForMutation();
    scope = mutation.scope;
    const audit = mutation.audit;
    mocks.auditCopy.mockReset().mockReturnValue(pending.promise);

    const request = audit.audit('risk');
    scope?.stop();
    pending.resolve(undefined);
    await request;

    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.listCopies).not.toHaveBeenCalled();
    expect(audit.submitting.value).toBe(false);
  });
});
