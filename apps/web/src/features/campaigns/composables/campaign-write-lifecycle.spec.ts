import { effectScope, type EffectScope } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketingCampaign } from '@content/shared';

const mocks = vi.hoisted(() => ({
  listCampaigns: vi.fn(),
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
  startCampaign: vi.fn(),
  pauseCampaign: vi.fn(),
  completeCampaign: vi.fn(),
  cancelCampaign: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn()
}));

vi.mock('element-plus', () => ({
  ElMessage: {
    success: mocks.success,
    error: mocks.error,
    warning: mocks.warning
  },
  ElMessageBox: {
    confirm: mocks.confirm
  }
}));

vi.mock('../../../services/api', () => ({
  api: {
    listCampaigns: mocks.listCampaigns,
    createCampaign: mocks.createCampaign,
    updateCampaign: mocks.updateCampaign,
    deleteCampaign: mocks.deleteCampaign,
    startCampaign: mocks.startCampaign,
    pauseCampaign: mocks.pauseCampaign,
    completeCampaign: mocks.completeCampaign,
    cancelCampaign: mocks.cancelCampaign
  }
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return { ...actual, onMounted: vi.fn() };
});

import { useCampaignForm } from './useCampaignForm';
import { useCampaigns } from './useCampaigns';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createCampaign(campaignId = 'campaign-a'): MarketingCampaign {
  return {
    campaignId,
    name: '活动 A',
    campaignType: 'daily',
    status: 'draft',
    startDate: '2026-08-10',
    endDate: '2026-08-20',
    areaIds: ['area-a'],
    merchantIds: [],
    budget: 100,
    targetGmv: 1000,
    targetOrders: 10,
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z'
  };
}

function fillNewCampaignForm(controller: ReturnType<typeof useCampaignForm>): void {
  controller.form.name = '新活动';
  controller.form.startDate = '2026-08-10';
  controller.form.endDate = '2026-08-20';
  controller.form.areaIds = ['area-a'];
}

describe('campaign write lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.listCampaigns.mockResolvedValue({ items: [], total: 0 });
    mocks.confirm.mockResolvedValue(true);
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps the create dialog open and clears the error after a successful retry', async () => {
    mocks.createCampaign
      .mockRejectedValueOnce(new Error('create unavailable'))
      .mockResolvedValueOnce({});
    scope = effectScope();
    const controller = scope.run(() => useCampaignForm())!;
    controller.open();
    fillNewCampaignForm(controller);

    await controller.submit();

    expect(controller.writeError.value).toBe('创建活动失败');
    expect(controller.dialogVisible).toBe(true);
    expect(mocks.error).toHaveBeenCalledWith('创建活动失败');

    await controller.submit();

    expect(controller.writeError.value).toBeNull();
    expect(controller.dialogVisible).toBe(false);
    expect(mocks.success).toHaveBeenCalledWith('活动已创建');
  });

  it('keeps the edit dialog open and retries the update with the current campaign type', async () => {
    mocks.updateCampaign
      .mockRejectedValueOnce(new Error('update unavailable'))
      .mockResolvedValueOnce({});
    scope = effectScope();
    const controller = scope.run(() => useCampaignForm())!;
    controller.open(createCampaign());
    controller.form.campaignType = 'flash';

    await controller.submit();

    expect(controller.writeError.value).toBe('更新活动失败');
    expect(controller.dialogVisible).toBe(true);

    await controller.submit();

    expect(mocks.updateCampaign).toHaveBeenNthCalledWith(
      1,
      'campaign-a',
      expect.objectContaining({
        campaignType: 'flash'
      })
    );
    expect(controller.writeError.value).toBeNull();
    expect(controller.dialogVisible).toBe(false);
  });

  it('suppresses a late form result after scope disposal', async () => {
    const pending = createDeferred<unknown>();
    mocks.createCampaign.mockReturnValue(pending.promise);
    scope = effectScope();
    const controller = scope.run(() => useCampaignForm())!;
    controller.open();
    fillNewCampaignForm(controller);

    const submit = controller.submit();
    scope.stop();
    pending.resolve({});
    await submit;

    expect(controller.dialogVisible).toBe(true);
    expect(controller.submitting.value).toBe(false);
    expect(controller.writeError.value).toBeNull();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('surfaces transition failures, blocks duplicates, and clears after retry', async () => {
    const pending = createDeferred<unknown>();
    mocks.startCampaign.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({});
    scope = effectScope();
    const controller = scope.run(() => useCampaigns())!;
    const campaign = createCampaign();

    const first = controller.handleStart(campaign);
    const duplicate = controller.handleStart(campaign);
    await duplicate;
    expect(mocks.startCampaign).toHaveBeenCalledTimes(1);
    expect(mocks.startCampaign).toHaveBeenCalledWith('campaign-a', '2026-08-09T00:00:00.000Z');

    pending.resolve({});
    await first;
    await controller.handleStart(campaign);

    expect(controller.writeError.value).toBeNull();
    expect(mocks.success).toHaveBeenCalledWith('活动已启动');
  });

  it('keeps delete failures visible, treats confirmation cancel as non-error, and retries', async () => {
    mocks.deleteCampaign
      .mockRejectedValueOnce(new Error('delete unavailable'))
      .mockResolvedValueOnce({});
    scope = effectScope();
    const controller = scope.run(() => useCampaigns())!;
    const campaign = createCampaign();

    mocks.confirm.mockRejectedValueOnce(new Error('cancelled'));
    await controller.handleDelete(campaign);
    expect(mocks.deleteCampaign).not.toHaveBeenCalled();
    expect(controller.writeError.value).toBeNull();

    await controller.handleDelete(campaign);
    expect(controller.writeError.value).toBe('删除活动失败');

    await controller.handleDelete(campaign);
    expect(controller.writeError.value).toBeNull();
    expect(mocks.deleteCampaign).toHaveBeenCalledTimes(2);
  });

  it('suppresses a late transition result after scope disposal', async () => {
    const pending = createDeferred<unknown>();
    mocks.startCampaign.mockReturnValue(pending.promise);
    scope = effectScope();
    const controller = scope.run(() => useCampaigns())!;

    const transition = controller.handleStart(createCampaign());
    scope.stop();
    pending.resolve({});
    await transition;

    expect(controller.actionLoading.value).toBe(false);
    expect(controller.writeError.value).toBeNull();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });
});
