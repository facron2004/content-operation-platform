import { effectScope, type EffectScope } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserFormPayload, UserRow } from './types';

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deactivateUser: vi.fn(),
  success: vi.fn(),
  error: vi.fn()
}));

vi.mock('element-plus', () => ({
  ElMessage: {
    success: mocks.success,
    error: mocks.error
  }
}));

vi.mock('../../services/api', () => ({
  api: {
    listUsers: mocks.listUsers,
    createUser: mocks.createUser,
    updateUser: mocks.updateUser,
    deactivateUser: mocks.deactivateUser
  }
}));

vi.mock('../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return { ...actual, onMounted: vi.fn() };
});

import { useUserManagement } from './useUserManagement';

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

function createUser(userId: string): UserRow {
  return {
    userId,
    username: userId,
    displayName: userId,
    isActive: true
  };
}

function createPayload(displayName: string): UserFormPayload {
  return {
    username: 'operator',
    password: 'password-123',
    displayName,
    roles: [{ role: 'executor' }]
  };
}

describe('user management write lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.listUsers.mockResolvedValue({ items: [], total: 0 });
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('blocks duplicate creates and snapshots the form payload', async () => {
    const pending = createDeferred<unknown>();
    mocks.createUser.mockReturnValue(pending.promise);
    scope = effectScope();
    const controller = scope.run(() => useUserManagement())!;
    controller.openCreate();

    const payload = createPayload('原始名称');
    const first = controller.submitUser(payload);
    const duplicate = controller.submitUser(createPayload('重复提交'));
    payload.displayName = '迟到修改';
    payload.roles![0]!.role = 'admin';

    await duplicate;
    expect(mocks.createUser).toHaveBeenCalledTimes(1);
    expect(mocks.createUser).toHaveBeenCalledWith({
      username: 'operator',
      password: 'password-123',
      displayName: '原始名称',
      roles: [{ role: 'executor' }]
    });

    pending.resolve({});
    await first;

    expect(mocks.success).toHaveBeenCalledWith('用户已创建');
    expect(mocks.success).toHaveBeenCalledTimes(1);
    expect(controller.formVisible.value).toBe(false);
    expect(controller.submitting.value).toBe(false);
  });

  it('keeps the create form and exposes a persistent error until retry succeeds', async () => {
    mocks.createUser
      .mockRejectedValueOnce(new Error('create unavailable'))
      .mockResolvedValueOnce({});
    scope = effectScope();
    const controller = scope.run(() => useUserManagement())!;
    controller.openCreate();

    await controller.submitUser(createPayload('创建失败后重试'));

    expect(controller.writeError.value).toBe('创建失败');
    expect(controller.formVisible.value).toBe(true);
    expect(mocks.error).toHaveBeenCalledWith('创建失败');

    await controller.submitUser(createPayload('创建成功'));

    expect(controller.writeError.value).toBeNull();
    expect(controller.formVisible.value).toBe(false);
  });

  it('keeps the edit form and clears its write error after a successful retry', async () => {
    mocks.updateUser
      .mockRejectedValueOnce(new Error('update unavailable'))
      .mockResolvedValueOnce({});
    scope = effectScope();
    const controller = scope.run(() => useUserManagement())!;
    controller.handleEdit(createUser('user-a'));

    await controller.submitUser(createPayload('更新失败后重试'));

    expect(controller.writeError.value).toBe('更新失败');
    expect(controller.formVisible.value).toBe(true);

    await controller.submitUser(createPayload('更新成功'));

    expect(controller.writeError.value).toBeNull();
    expect(controller.formVisible.value).toBe(false);
  });

  it('clears status write errors after a successful deactivate and activate retry', async () => {
    mocks.deactivateUser.mockRejectedValueOnce(new Error('deactivate unavailable'));
    mocks.updateUser.mockResolvedValue({});
    scope = effectScope();
    const controller = scope.run(() => useUserManagement())!;
    const row = createUser('user-a');

    await controller.handleDeactivate(row);

    expect(controller.writeError.value).toBe('停用失败');

    await controller.handleActivate(row);

    expect(controller.writeError.value).toBeNull();
  });

  it('drops a late edit result after switching to a new form', async () => {
    const pending = createDeferred<unknown>();
    mocks.updateUser.mockReturnValue(pending.promise);
    scope = effectScope();
    const controller = scope.run(() => useUserManagement())!;
    controller.handleEdit(createUser('user-a'));

    const payload = createPayload('用户 A');
    const submit = controller.submitUser(payload);
    payload.displayName = '迟到名称';
    controller.openCreate();
    pending.resolve({});

    await submit;

    expect(mocks.updateUser).toHaveBeenCalledWith('user-a', {
      password: 'password-123',
      displayName: '用户 A'
    });
    expect(mocks.success).not.toHaveBeenCalled();
    expect(controller.formVisible.value).toBe(true);
    expect(controller.isEdit.value).toBe(false);
  });

  it('blocks duplicate status changes and reloads after the active result', async () => {
    const pending = createDeferred<unknown>();
    mocks.updateUser.mockReturnValue(pending.promise);
    scope = effectScope();
    const controller = scope.run(() => useUserManagement())!;
    const row = createUser('user-a');

    const first = controller.handleActivate(row);
    const duplicate = controller.handleActivate(row);
    await duplicate;

    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
    pending.resolve({});
    await first;

    expect(mocks.success).toHaveBeenCalledWith('用户已启用');
    expect(mocks.listUsers).toHaveBeenCalledTimes(1);

    mocks.deactivateUser.mockResolvedValue({});
    await controller.handleDeactivate(row);
    expect(mocks.deactivateUser).toHaveBeenCalledWith('user-a');
    expect(mocks.success).toHaveBeenCalledWith('用户已停用');
  });

  it('suppresses late create feedback after scope disposal', async () => {
    const pending = createDeferred<unknown>();
    mocks.createUser.mockReturnValue(pending.promise);
    scope = effectScope();
    const controller = scope.run(() => useUserManagement())!;
    controller.openCreate();

    const submit = controller.submitUser(createPayload('待处理'));
    scope.stop();
    pending.resolve({});

    await submit;

    expect(controller.formVisible.value).toBe(true);
    expect(controller.submitting.value).toBe(false);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('keeps user rows visible during a failed search and clears the error after retry', async () => {
    mocks.listUsers
      .mockReset()
      .mockResolvedValueOnce({ items: [createUser('user-a')], total: 1 })
      .mockRejectedValueOnce(new Error('user list unavailable'))
      .mockResolvedValueOnce({ items: [createUser('user-b')], total: 1 });
    scope = effectScope();
    const controller = scope.run(() => useUserManagement())!;

    await controller.handleSearch();
    await controller.handleSearch();
    expect(controller.items.value[0]?.userId).toBe('user-a');
    expect(controller.error.value).toBe('user list unavailable');

    await controller.handleSearch();
    expect(controller.items.value[0]?.userId).toBe('user-b');
    expect(controller.error.value).toBeNull();
  });
});
