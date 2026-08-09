import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, reactive, ref, type EffectScope } from 'vue';
import type { BattleCard, GeneratedCopy } from '@content/shared';
import type { useAICopyConfig } from './useAICopyConfig';
import type { usePackageDetail } from './usePackageDetail';

const mocks = vi.hoisted(() => ({
  generateCopies: vi.fn(),
  generateBattleCard: vi.fn(),
  success: vi.fn(),
  warning: vi.fn()
}));

vi.mock('element-plus', () => ({
  ElMessage: {
    success: mocks.success,
    warning: mocks.warning
  }
}));

vi.mock('../services/api', () => ({
  api: {
    generateCopies: mocks.generateCopies,
    generateBattleCard: mocks.generateBattleCard
  }
}));
vi.mock('../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { createGenerateActions } from './generate-core';

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

function copyFor(title: string): GeneratedCopy {
  return {
    contentId: title,
    packageId: 'package-1',
    areaId: 'area-1',
    merchantId: 'merchant-1',
    channel: 'wechat_group',
    scenario: '日常运营推荐',
    title,
    body: `${title} body`,
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

function battleCardFor(packageId: string): BattleCard {
  return {
    packageId,
    packageName: `${packageId} package`,
    generatedAt: '2026-08-05T00:00:00.000Z',
    recommendationReason: '适合当前场景',
    targetAudience: ['会员'],
    suitableChannels: ['wechat_group'],
    recommendedPushTime: '18:00',
    mainSellingPoints: ['方便'],
    riskTips: [],
    communityCopy: '社群文案',
    momentsCopy: '朋友圈文案',
    merchantShareCopy: '商家分享文案',
    followUpCopy: '跟进文案',
    soldOutFallbackCopy: '售罄兜底文案'
  };
}

function createActions() {
  const form = reactive({
    packageId: 'package-1',
    channel: 'wechat_group' as const,
    scenario: '',
    tone: '真实群主口吻',
    copyCount: 3,
    extraInstruction: ''
  });
  const state = {
    loading: ref(false),
    generationMode: ref<'ai' | 'rule' | null>(null),
    copies: ref<GeneratedCopy[]>([]),
    generationError: ref<string | null>(null)
  };
  const battleCard = ref<BattleCard | null>(null);
  const battleCardError = ref<string | null>(null);
  const battleCardLoading = ref(false);
  const ai = { aiStatus: ref(null) } as unknown as ReturnType<typeof useAICopyConfig>;
  const detail = { loadPackageDetail: vi.fn() } as unknown as ReturnType<typeof usePackageDetail>;
  const actions = createGenerateActions({
    form,
    copies: state.copies,
    generationError: state.generationError,
    battleCard,
    battleCardError,
    battleCardLoading,
    battleCardRequestId: { current: 0 },
    loading: state.loading,
    generationMode: state.generationMode,
    ai,
    detail
  });
  return { actions, state, form, battleCard, battleCardError, battleCardLoading };
}

describe('Generate copy submission lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    mocks.generateCopies.mockReset();
    mocks.generateBattleCard.mockReset();
    mocks.success.mockReset();
    mocks.warning.mockReset();
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('blocks duplicate generation while the first request is pending', async () => {
    const pending = createDeferred<{ contentList: GeneratedCopy[] }>();
    mocks.generateCopies.mockReturnValue(pending.promise);
    scope = effectScope();
    let generated!: ReturnType<typeof createActions>;
    scope.run(() => {
      generated = createActions();
    });

    const first = generated.actions.generate();
    const duplicate = generated.actions.generate();
    await duplicate;

    expect(mocks.generateCopies).toHaveBeenCalledTimes(1);
    expect(generated.state.loading.value).toBe(true);
    pending.resolve({ contentList: [copyFor('generated')] });
    await first;

    expect(generated.state.copies.value[0]?.title).toBe('generated');
    expect(generated.state.loading.value).toBe(false);
    expect(generated.state.generationMode.value).toBeNull();
    expect(mocks.success).toHaveBeenCalledTimes(1);
  });

  it('suppresses late generation data and feedback after scope disposal', async () => {
    const pending = createDeferred<{ contentList: GeneratedCopy[] }>();
    mocks.generateCopies.mockReturnValue(pending.promise);
    scope = effectScope();
    let generated!: ReturnType<typeof createActions>;
    scope.run(() => {
      generated = createActions();
    });

    const generation = generated.actions.generate();
    scope.stop();
    pending.resolve({ contentList: [copyFor('late')] });
    await generation;
    await generated.actions.generate();

    expect(generated.state.copies.value).toEqual([]);
    expect(generated.state.loading.value).toBe(false);
    expect(generated.state.generationMode.value).toBeNull();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.generateCopies).toHaveBeenCalledTimes(1);
  });

  it('blocks duplicate battle-card requests while the first request is pending', async () => {
    const pending = createDeferred<BattleCard>();
    mocks.generateBattleCard.mockReturnValue(pending.promise);
    scope = effectScope();
    let generated!: ReturnType<typeof createActions>;
    scope.run(() => {
      generated = createActions();
    });

    const first = generated.actions.loadBattleCard();
    await generated.actions.loadBattleCard();

    expect(mocks.generateBattleCard).toHaveBeenCalledTimes(1);
    expect(generated.battleCardLoading.value).toBe(true);
    pending.resolve(battleCardFor('package-1'));
    await first;

    expect(generated.battleCard.value?.packageId).toBe('package-1');
    expect(generated.battleCardLoading.value).toBe(false);
  });

  it('surfaces battle-card failure and clears it after a successful retry', async () => {
    mocks.generateBattleCard.mockRejectedValueOnce(new Error('battle card unavailable'));
    scope = effectScope();
    let generated!: ReturnType<typeof createActions>;
    scope.run(() => {
      generated = createActions();
    });

    await generated.actions.loadBattleCard();

    expect(generated.battleCardError.value).toBe('作战卡生成失败，请稍后重试');
    expect(generated.battleCardLoading.value).toBe(false);

    mocks.generateBattleCard.mockResolvedValueOnce(battleCardFor('package-1'));
    await generated.actions.loadBattleCard();

    expect(generated.battleCardError.value).toBeNull();
    expect(generated.battleCard.value?.packageId).toBe('package-1');
  });

  it('suppresses late battle-card data after scope disposal', async () => {
    const pending = createDeferred<BattleCard>();
    mocks.generateBattleCard.mockReturnValue(pending.promise);
    scope = effectScope();
    let generated!: ReturnType<typeof createActions>;
    scope.run(() => {
      generated = createActions();
    });

    const load = generated.actions.loadBattleCard();
    scope.stop();
    pending.resolve(battleCardFor('package-1'));
    await load;
    await generated.actions.loadBattleCard();

    expect(generated.battleCard.value).toBeNull();
    expect(generated.battleCardLoading.value).toBe(false);
    expect(mocks.generateBattleCard).toHaveBeenCalledTimes(1);
  });

  it('invalidates a pending battle card when the selected package changes', async () => {
    const pending = createDeferred<BattleCard>();
    mocks.generateBattleCard.mockReturnValue(pending.promise);
    scope = effectScope();
    let generated!: ReturnType<typeof createActions>;
    scope.run(() => {
      generated = createActions();
    });

    const load = generated.actions.loadBattleCard();
    generated.battleCardError.value = '旧作战卡错误';
    generated.state.generationError.value = '旧文案错误';
    generated.form.packageId = 'package-2';
    await nextTick();
    pending.resolve(battleCardFor('package-1'));
    await load;

    expect(generated.battleCard.value).toBeNull();
    expect(generated.battleCardError.value).toBeNull();
    expect(generated.state.generationError.value).toBeNull();
    expect(generated.battleCardLoading.value).toBe(false);
  });

  it('surfaces copy generation failure and clears it after a successful retry', async () => {
    mocks.generateCopies.mockRejectedValueOnce(new Error('generation unavailable'));
    scope = effectScope();
    let generated!: ReturnType<typeof createActions>;
    scope.run(() => {
      generated = createActions();
    });

    await generated.actions.generate();

    expect(generated.state.generationError.value).toBe('文案生成失败，请稍后重试');
    expect(generated.state.loading.value).toBe(false);

    mocks.generateCopies.mockResolvedValueOnce({ contentList: [copyFor('recovered')] });
    await generated.actions.generate();

    expect(generated.state.generationError.value).toBeNull();
    expect(generated.state.copies.value[0]?.title).toBe('recovered');
  });
});
