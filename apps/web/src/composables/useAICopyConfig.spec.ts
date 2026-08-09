import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import type { AICopyStatus } from '@content/shared';

const mocks = vi.hoisted(() => ({
  getAICopyStatus: vi.fn(),
  updateAICopyConfig: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn()
}));

vi.mock('element-plus', () => ({
  ElMessage: {
    success: mocks.success,
    warning: mocks.warning,
    error: mocks.error
  }
}));

vi.mock('../services/api', () => ({
  api: {
    getAICopyStatus: mocks.getAICopyStatus,
    updateAICopyConfig: mocks.updateAICopyConfig
  }
}));

vi.mock('../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { useAICopyConfig } from './useAICopyConfig';

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

function statusFor(model: string): AICopyStatus {
  return {
    enabled: true,
    providerName: 'Test Provider',
    baseURL: 'https://ai.example.test/v1',
    model,
    missing: [],
    maskedApiKey: '****test',
    temperature: 0.4,
    maxTokens: 700
  };
}

describe('AI copy config request lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    mocks.getAICopyStatus.mockReset();
    mocks.updateAICopyConfig.mockReset();
    mocks.success.mockReset();
    mocks.warning.mockReset();
    mocks.error.mockReset();
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('blocks duplicate saves and keeps the payload captured at submission time', async () => {
    const pending = createDeferred<AICopyStatus>();
    mocks.updateAICopyConfig.mockReturnValue(pending.promise);
    scope = effectScope();
    const config = scope.run(() => useAICopyConfig())!;
    Object.assign(config.configForm, {
      apiKey: 'secret-at-submit',
      baseURL: 'https://ai.example.test/v1',
      model: 'model-at-submit'
    });

    const firstSave = config.saveAICopyConfig();
    config.configForm.model = 'edited-after-submit';
    await config.saveAICopyConfig();

    expect(mocks.updateAICopyConfig).toHaveBeenCalledTimes(1);
    expect(mocks.updateAICopyConfig).toHaveBeenCalledWith({
      apiKey: 'secret-at-submit',
      baseURL: 'https://ai.example.test/v1',
      model: 'model-at-submit',
      providerName: 'DeepSeek',
      temperature: 0.7,
      maxTokens: 900
    });
    expect(config.configSaving.value).toBe(true);

    pending.resolve(statusFor('server-model'));
    await firstSave;

    expect(config.aiStatus.value?.model).toBe('server-model');
    expect(config.configForm.model).toBe('server-model');
    expect(config.configSaving.value).toBe(false);
    expect(mocks.success).toHaveBeenCalledTimes(1);
  });

  it('keeps the latest status refresh and ignores an older response', async () => {
    const first = createDeferred<AICopyStatus>();
    const second = createDeferred<AICopyStatus>();
    mocks.getAICopyStatus
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    scope = effectScope();
    const config = scope.run(() => useAICopyConfig())!;

    const firstLoad = config.loadAICopyStatus();
    const secondLoad = config.loadAICopyStatus();
    second.resolve(statusFor('latest-model'));
    await secondLoad;
    first.resolve(statusFor('stale-model'));
    await firstLoad;

    expect(config.aiStatus.value?.model).toBe('latest-model');
    expect(config.configForm.model).toBe('latest-model');
  });

  it('exposes a save failure and clears it after a successful retry', async () => {
    mocks.updateAICopyConfig
      .mockRejectedValueOnce(new Error('save unavailable'))
      .mockResolvedValueOnce(statusFor('recovered-model'));
    scope = effectScope();
    const config = scope.run(() => useAICopyConfig())!;
    config.configForm.apiKey = 'secret-at-submit';

    await config.saveAICopyConfig();
    expect(config.configError.value).toBe('AI接口配置保存失败，请稍后重试');
    expect(config.aiStatus.value).toBeNull();

    await config.saveAICopyConfig();
    expect(config.configError.value).toBeNull();
    expect(config.aiStatus.value?.model).toBe('recovered-model');
    expect(mocks.success).toHaveBeenCalledWith('AI接口配置已保存');
  });

  it('exposes a status read failure and clears it after a successful retry', async () => {
    mocks.getAICopyStatus.mockRejectedValueOnce(new Error('status unavailable'));
    scope = effectScope();
    const config = scope.run(() => useAICopyConfig())!;

    await config.loadAICopyStatus();
    expect(config.aiStatusError.value).toBe('AI接口状态读取失败，请稍后重试');
    expect(config.aiStatus.value).toBeNull();

    mocks.getAICopyStatus.mockResolvedValueOnce(statusFor('recovered-model'));
    await config.loadAICopyStatus();

    expect(config.aiStatusError.value).toBeNull();
    expect(config.aiStatus.value?.model).toBe('recovered-model');
  });

  it('does not let a status refresh started before save overwrite the saved status', async () => {
    const staleStatus = createDeferred<AICopyStatus>();
    const savedStatus = createDeferred<AICopyStatus>();
    mocks.getAICopyStatus.mockReturnValue(staleStatus.promise);
    mocks.updateAICopyConfig.mockReturnValue(savedStatus.promise);
    scope = effectScope();
    const config = scope.run(() => useAICopyConfig())!;
    config.configForm.apiKey = 'secret-at-submit';

    const load = config.loadAICopyStatus();
    const save = config.saveAICopyConfig();
    staleStatus.resolve(statusFor('stale-model'));
    await load;

    expect(config.aiStatus.value).toBeNull();
    savedStatus.resolve(statusFor('saved-model'));
    await save;

    expect(config.aiStatus.value?.model).toBe('saved-model');
    expect(config.configForm.model).toBe('saved-model');
  });

  it('drops late save state and feedback after scope disposal', async () => {
    const pending = createDeferred<AICopyStatus>();
    mocks.updateAICopyConfig.mockReturnValue(pending.promise);
    scope = effectScope();
    const config = scope.run(() => useAICopyConfig())!;
    config.configForm.apiKey = 'secret-at-submit';

    const save = config.saveAICopyConfig();
    scope.stop();
    pending.resolve(statusFor('late-model'));
    await save;
    await config.saveAICopyConfig();

    expect(config.aiStatus.value).toBeNull();
    expect(config.configSaving.value).toBe(false);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.updateAICopyConfig).toHaveBeenCalledTimes(1);
  });
});
