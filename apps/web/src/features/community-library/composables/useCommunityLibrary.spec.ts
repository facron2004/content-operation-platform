import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import type { CommunityGroupEntity } from '@content/shared';

const mocks = vi.hoisted(() => ({
  listCommunities: vi.fn(),
  createCommunity: vi.fn(),
  updateCommunity: vi.fn(),
  importCommunities: vi.fn(),
  deleteCommunity: vi.fn(),
  confirm: vi.fn(),
  error: vi.fn(),
  success: vi.fn()
}));

vi.mock('element-plus', () => ({
  ElMessage: {
    error: mocks.error,
    success: mocks.success
  },
  ElMessageBox: {
    confirm: mocks.confirm
  }
}));

vi.mock('../../../services/api', () => ({
  api: {
    listCommunities: mocks.listCommunities,
    createCommunity: mocks.createCommunity,
    updateCommunity: mocks.updateCommunity,
    importCommunities: mocks.importCommunities,
    deleteCommunity: mocks.deleteCommunity
  }
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return { ...actual, onMounted: vi.fn() };
});

import { useCommunityLibrary } from './useCommunityLibrary';

describe('community library list read lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps community rows during failure and clears the error after retry', async () => {
    mocks.listCommunities
      .mockResolvedValueOnce({ items: [{ groupId: 'community-a' }], total: 1 })
      .mockRejectedValueOnce(new Error('community list unavailable'))
      .mockResolvedValueOnce({ items: [{ groupId: 'community-b' }], total: 1 });
    scope = effectScope();
    const controller = scope.run(() => useCommunityLibrary())!;

    await controller.load(true);
    await controller.load(true);
    expect(controller.items.value[0]?.groupId).toBe('community-a');
    expect(controller.error.value).toBe('community list unavailable');
    expect(mocks.error).toHaveBeenCalledWith('加载社群列表失败');

    await controller.load(true);
    expect(controller.items.value[0]?.groupId).toBe('community-b');
    expect(controller.error.value).toBeNull();
  });

  it('surfaces create failure and clears it after a successful retry', async () => {
    mocks.createCommunity
      .mockRejectedValueOnce(new Error('community write unavailable'))
      .mockResolvedValueOnce({ groupId: 'community-a' });
    mocks.listCommunities.mockResolvedValue({ items: [], total: 0 });
    scope = effectScope();
    const controller = scope.run(() => useCommunityLibrary())!;
    const payload = { groupName: 'community-a', groupType: 'wechat_group', areaId: 'area-1' };

    await expect(controller.saveCommunity(null, payload)).resolves.toBe(false);
    expect(controller.writeError.value).toBe('community write unavailable');
    expect(controller.createSubmitting.value).toBe(false);

    await expect(controller.saveCommunity(null, payload)).resolves.toBe(true);
    expect(controller.writeError.value).toBeNull();
    expect(mocks.success).toHaveBeenCalledWith('社群已创建');
  });

  it('blocks duplicate writes while the first community save is pending', async () => {
    let resolveCreate!: (value: unknown) => void;
    mocks.createCommunity.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      })
    );
    scope = effectScope();
    const controller = scope.run(() => useCommunityLibrary())!;
    const payload = { groupName: 'community-a', groupType: 'wechat_group', areaId: 'area-1' };

    const first = controller.saveCommunity(null, payload);
    const duplicate = controller.saveCommunity(null, payload);
    expect(mocks.createCommunity).toHaveBeenCalledTimes(1);
    expect(controller.createSubmitting.value).toBe(true);

    resolveCreate({ groupId: 'community-a' });
    await expect(first).resolves.toBe(true);
    await expect(duplicate).resolves.toBe(false);
    expect(controller.createSubmitting.value).toBe(false);
  });

  it('surfaces import failure and clears it after a successful retry', async () => {
    mocks.importCommunities
      .mockRejectedValueOnce(new Error('invalid community import'))
      .mockResolvedValueOnce({ created: 2 });
    mocks.listCommunities.mockResolvedValue({ items: [], total: 0 });
    scope = effectScope();
    const controller = scope.run(() => useCommunityLibrary())!;
    const payload = { source: 'csv' as const, rawData: 'groupName,groupType,areaId' };

    await expect(controller.importCommunities(payload)).resolves.toBe(false);
    expect(controller.writeError.value).toBe('invalid community import');
    expect(controller.importSubmitting.value).toBe(false);

    await expect(controller.importCommunities(payload)).resolves.toBe(true);
    expect(controller.writeError.value).toBeNull();
    expect(mocks.success).toHaveBeenCalledWith('社群导入成功');
    expect(mocks.importCommunities.mock.calls[0]?.[1]).toMatch(/^batch-import:/);
    expect(mocks.importCommunities.mock.calls[1]?.[1]).toBe(
      mocks.importCommunities.mock.calls[0]?.[1]
    );
  });

  it('keeps row mutation failures visible and clears them after retry', async () => {
    mocks.confirm.mockResolvedValue(undefined);
    mocks.deleteCommunity
      .mockRejectedValueOnce(new Error('community delete unavailable'))
      .mockResolvedValueOnce({});
    mocks.listCommunities.mockResolvedValue({ items: [], total: 0 });
    scope = effectScope();
    const controller = scope.run(() => useCommunityLibrary())!;
    const community = { groupId: 'community-a', groupName: 'community-a' } as CommunityGroupEntity;

    await controller.handleDelete(community);
    expect(controller.writeError.value).toBe('community delete unavailable');

    await controller.handleDelete(community);
    expect(controller.writeError.value).toBeNull();
    expect(mocks.success).toHaveBeenCalledWith('社群已删除');
  });

  it('suppresses late row mutation feedback after scope disposal', async () => {
    let resolveDelete!: (value: unknown) => void;
    mocks.confirm.mockResolvedValue(undefined);
    mocks.deleteCommunity.mockReturnValue(
      new Promise((resolve) => {
        resolveDelete = resolve;
      })
    );
    scope = effectScope();
    const controller = scope.run(() => useCommunityLibrary())!;
    const community = { groupId: 'community-a', groupName: 'community-a' } as CommunityGroupEntity;

    const deletion = controller.handleDelete(community);
    await Promise.resolve();
    scope.stop();
    resolveDelete({});
    await deletion;

    expect(controller.writeError.value).toBeNull();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('does not project a late import failure after scope disposal', async () => {
    let rejectImport!: (error: unknown) => void;
    mocks.importCommunities.mockReturnValue(
      new Promise((_, reject) => {
        rejectImport = reject;
      })
    );
    scope = effectScope();
    const controller = scope.run(() => useCommunityLibrary())!;
    const submit = controller.importCommunities({ source: 'json', rawData: '[]' });

    scope.stop();
    rejectImport(new Error('late import failure'));
    await submit;

    expect(controller.writeError.value).toBeNull();
    expect(controller.importSubmitting.value).toBe(false);
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
