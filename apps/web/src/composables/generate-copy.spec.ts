import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import type { GeneratedCopy } from '@content/shared';

const mocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn()
}));

vi.mock('element-plus', () => ({
  ElMessage: {
    success: mocks.success,
    error: mocks.error,
    warning: mocks.warning
  }
}));

vi.mock('../services/api', () => ({ api: {} }));
vi.mock('../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} })
}));

import { copyGeneratedText } from './generate-core';
import { useGenerate } from './useGenerate';

function copyFor(): GeneratedCopy {
  return {
    contentId: 'content-1',
    packageId: 'package-1',
    areaId: 'area-1',
    merchantId: 'merchant-1',
    channel: 'wechat_group',
    scenario: '日常运营推荐',
    title: '标题',
    body: '正文',
    cta: '立即查看',
    copyVersion: 'v1',
    strategyType: 'fallback',
    riskLevel: 'low',
    riskTips: [],
    auditStatus: 'pending',
    createdBy: 'user-1',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z'
  };
}

describe('Generate copy clipboard lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    mocks.success.mockReset();
    mocks.error.mockReset();
    mocks.warning.mockReset();
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
    vi.unstubAllGlobals();
  });

  it('keeps copy failures visible until a retry succeeds', async () => {
    const writeText = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('clipboard blocked'))
      .mockResolvedValueOnce(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('window', { isSecureContext: true });

    scope = effectScope();
    const state = scope.run(() => useGenerate())!;

    expect(await state.copyText(copyFor())).toBe(false);
    expect(state.copyError.value).toBe('复制失败，请手动复制');
    expect(mocks.error).toHaveBeenCalledWith('复制失败，请手动复制');

    expect(await state.copyText(copyFor())).toBe(true);
    expect(state.copyError.value).toBeNull();
    expect(mocks.success).toHaveBeenCalledWith('已复制到剪贴板');
  });

  it('treats a rejected fallback execCommand result as a copy failure', async () => {
    const textarea = {
      value: '',
      style: {},
      focus: vi.fn(),
      select: vi.fn()
    };
    const documentMock = {
      createElement: vi.fn(() => textarea),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn()
      },
      execCommand: vi.fn(() => false)
    };
    vi.stubGlobal('navigator', { clipboard: undefined });
    vi.stubGlobal('window', { isSecureContext: false });
    vi.stubGlobal('document', documentMock);

    expect(await copyGeneratedText(copyFor())).toBe(false);
    expect(documentMock.body.removeChild).toHaveBeenCalledWith(textarea);
  });

  it('suppresses late copy feedback after scope disposal', async () => {
    let resolveCopy!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveCopy = resolve;
    });
    const writeText = vi.fn(() => pending);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('window', { isSecureContext: true });

    scope = effectScope();
    const state = scope.run(() => useGenerate())!;
    const copy = state.copyText(copyFor());

    scope.stop();
    resolveCopy();

    expect(await copy).toBe(true);
    expect(state.copyError.value).toBeNull();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });
});
