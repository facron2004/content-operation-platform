import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, type EffectScope } from 'vue';
import type { RuleConfig } from '@content/shared';
import type { RuleListResponse } from '../../../services/api/rules.api';

const mocks = vi.hoisted(() => ({
  listRules: vi.fn(),
  getRuleDefaults: vi.fn(),
  createRule: vi.fn(),
  activateRule: vi.fn(),
  deleteRule: vi.fn(),
  messageSuccess: vi.fn(),
  messageWarning: vi.fn(),
  messageError: vi.fn(),
  confirm: vi.fn()
}));

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return { ...actual, onMounted: () => undefined };
});

vi.mock('element-plus', () => ({
  ElMessage: {
    success: mocks.messageSuccess,
    warning: mocks.messageWarning,
    error: mocks.messageError
  },
  ElMessageBox: { confirm: mocks.confirm }
}));

vi.mock('../../../services/api', () => ({
  api: {
    listRules: mocks.listRules,
    getRuleDefaults: mocks.getRuleDefaults,
    createRule: mocks.createRule,
    activateRule: mocks.activateRule,
    deleteRule: mocks.deleteRule
  }
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { loadSettingsDefaults } from './settings-read';
import { useSettings } from './useSettings';

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

function ruleFor(name: string): RuleConfig {
  return {
    id: name,
    type: 'promotion',
    name,
    version: 1,
    isActive: false,
    payload: {},
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z'
  };
}

function listFor(name: string): RuleListResponse {
  return {
    items: [ruleFor(name)],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 }
  };
}

describe('settings request lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    mocks.listRules.mockReset().mockResolvedValue(listFor('default'));
    mocks.getRuleDefaults.mockReset().mockResolvedValue({ promotion: { enabled: true } });
    mocks.createRule.mockReset().mockResolvedValue(ruleFor('created'));
    mocks.activateRule.mockReset().mockResolvedValue(ruleFor('activated'));
    mocks.deleteRule.mockReset().mockResolvedValue(undefined);
    mocks.messageSuccess.mockReset();
    mocks.messageWarning.mockReset();
    mocks.messageError.mockReset();
    mocks.confirm.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps the latest rules response when an earlier load resolves late', async () => {
    const first = createDeferred<RuleListResponse>();
    const second = createDeferred<RuleListResponse>();
    mocks.listRules
      .mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const settings = scope.run(() => useSettings())!;

    const firstLoad = settings.load();
    settings.page.value = 2;
    const secondLoad = settings.load();
    second.resolve(listFor('latest'));
    await secondLoad;
    first.resolve(listFor('stale'));
    await firstLoad;

    expect(settings.rules.value[0]?.name).toBe('latest');
    expect(settings.loadError.value).toBeNull();
    expect(settings.loading.value).toBe(false);
  });

  it('surfaces an initial rules failure instead of treating the table as empty success', async () => {
    mocks.listRules.mockReset().mockRejectedValue(new Error('规则服务不可用'));
    scope = effectScope();
    const settings = scope.run(() => useSettings())!;

    await settings.load();

    expect(settings.loadError.value).toBe('规则列表加载失败，请稍后重试');
    expect(settings.rules.value).toEqual([]);
    expect(settings.loading.value).toBe(false);
  });

  it('keeps the last successful rules visible when a refresh fails', async () => {
    mocks.listRules
      .mockReset()
      .mockResolvedValueOnce(listFor('latest'))
      .mockRejectedValueOnce(new Error('规则服务暂时不可用'));
    scope = effectScope();
    const settings = scope.run(() => useSettings())!;

    await settings.load();
    await settings.load();

    expect(settings.rules.value[0]?.name).toBe('latest');
    expect(settings.loadError.value).toBe('规则列表加载失败，请稍后重试');
    expect(settings.loading.value).toBe(false);
  });

  it('drops late defaults when the current request guard is invalidated', async () => {
    const pending = createDeferred<Record<string, unknown>>();
    mocks.getRuleDefaults.mockReset().mockReturnValue(pending.promise);
    const defaults = ref<Record<string, unknown>>({ initial: true });
    let active = true;
    const load = loadSettingsDefaults(defaults, () => active);

    active = false;
    pending.resolve({ late: true });
    await load;

    expect(defaults.value).toEqual({ initial: true });
  });

  it('surfaces defaults failure and clears it after a successful retry', async () => {
    const defaults = ref<Record<string, unknown>>({ initial: true });
    const defaultsError = ref<string | null>(null);
    mocks.getRuleDefaults
      .mockReset()
      .mockRejectedValueOnce(new Error('defaults unavailable'))
      .mockResolvedValueOnce({ promotion: { enabled: true } });

    await loadSettingsDefaults(defaults, () => true, defaultsError);

    expect(defaults.value).toEqual({ initial: true });
    expect(defaultsError.value).toBe('规则默认值加载失败，请稍后重试');

    await loadSettingsDefaults(defaults, () => true, defaultsError);

    expect(defaults.value).toEqual({ promotion: { enabled: true } });
    expect(defaultsError.value).toBeNull();
  });

  it('drops late rules data and blocks new reads after scope disposal', async () => {
    const pending = createDeferred<RuleListResponse>();
    mocks.listRules.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const settings = scope.run(() => useSettings())!;
    const load = settings.load();

    scope.stop();
    pending.resolve(listFor('late'));
    await load;
    await settings.load();

    expect(settings.rules.value).toEqual([]);
    expect(settings.loading.value).toBe(false);
    expect(mocks.listRules).toHaveBeenCalledTimes(1);
  });

  it('blocks duplicate rule creation and snapshots the submitted form', async () => {
    const pending = createDeferred<RuleConfig>();
    mocks.createRule.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const settings = scope.run(() => useSettings())!;
    settings.openCreate();
    settings.dialogForm.name = 'first rule';
    settings.dialogForm.payloadText = '{"enabled":true}';

    const firstSubmit = settings.submitCreate();
    settings.dialogForm.name = 'second rule';
    const secondSubmit = settings.submitCreate();
    pending.resolve(ruleFor('created'));
    await Promise.all([firstSubmit, secondSubmit]);

    expect(mocks.createRule).toHaveBeenCalledTimes(1);
    expect(mocks.createRule).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'first rule', payload: { enabled: true } })
    );
    expect(settings.dialogVisible.value).toBe(false);
    expect(settings.submitting.value).toBe(false);
  });

  it('surfaces create failure and clears it after a successful retry', async () => {
    mocks.createRule
      .mockReset()
      .mockRejectedValueOnce(new Error('create rule unavailable'))
      .mockResolvedValueOnce(ruleFor('created'));
    scope = effectScope();
    const settings = scope.run(() => useSettings())!;
    settings.openCreate();
    settings.dialogForm.name = 'retry rule';
    settings.dialogForm.payloadText = '{}';

    await settings.submitCreate();
    expect(settings.writeError.value).toBe('创建规则失败，请稍后重试');
    expect(settings.dialogVisible.value).toBe(true);
    expect(settings.submitting.value).toBe(false);

    await settings.submitCreate();
    expect(settings.writeError.value).toBeNull();
    expect(settings.dialogVisible.value).toBe(false);
  });

  it('surfaces activation failure and clears it after a successful retry', async () => {
    mocks.activateRule
      .mockReset()
      .mockRejectedValueOnce(new Error('activate rule unavailable'))
      .mockResolvedValueOnce(ruleFor('activated'));
    scope = effectScope();
    const settings = scope.run(() => useSettings())!;
    const row = ruleFor('rule-to-activate');

    await settings.activate(row);
    expect(settings.writeError.value).toBe('激活规则失败，请稍后重试');
    expect(settings.mutating.value).toBe(false);

    await settings.activate(row);
    expect(settings.writeError.value).toBeNull();
  });

  it('surfaces delete failure while keeping a cancelled confirmation error-free', async () => {
    mocks.deleteRule
      .mockReset()
      .mockRejectedValueOnce(new Error('delete rule unavailable'))
      .mockResolvedValueOnce(undefined);
    scope = effectScope();
    const settings = scope.run(() => useSettings())!;
    const row = ruleFor('rule-to-delete');

    mocks.confirm.mockRejectedValueOnce(new Error('user cancelled'));
    await settings.remove(row);
    expect(settings.writeError.value).toBeNull();
    expect(mocks.deleteRule).not.toHaveBeenCalled();

    mocks.confirm.mockResolvedValueOnce(true);
    await settings.remove(row);
    expect(settings.writeError.value).toBe('删除规则失败，请稍后重试');

    await settings.remove(row);
    expect(settings.writeError.value).toBeNull();
  });

  it('does not publish late create feedback after scope disposal', async () => {
    const pending = createDeferred<RuleConfig>();
    mocks.createRule.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const settings = scope.run(() => useSettings())!;
    settings.openCreate();
    settings.dialogForm.name = 'late rule';
    settings.dialogForm.payloadText = '{}';
    const submit = settings.submitCreate();

    scope.stop();
    pending.resolve(ruleFor('late rule'));
    await submit;

    expect(settings.dialogVisible.value).toBe(true);
    expect(settings.submitting.value).toBe(false);
    expect(mocks.messageSuccess).not.toHaveBeenCalled();
  });

  it('blocks duplicate rule mutations while activation is pending', async () => {
    const pending = createDeferred<RuleConfig>();
    mocks.activateRule.mockReset().mockReturnValue(pending.promise);
    scope = effectScope();
    const settings = scope.run(() => useSettings())!;
    const row = ruleFor('rule-to-activate');

    const firstMutation = settings.activate(row);
    const secondMutation = settings.activate(row);
    pending.resolve(ruleFor('rule-to-activate'));
    await Promise.all([firstMutation, secondMutation]);

    expect(mocks.activateRule).toHaveBeenCalledTimes(1);
    expect(settings.mutating.value).toBe(false);
  });
});
