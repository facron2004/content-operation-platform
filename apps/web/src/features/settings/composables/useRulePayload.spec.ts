import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, type EffectScope } from 'vue';
import type { RuleConfig } from '@content/shared';

const mocks = vi.hoisted(() => ({
  loadRule: vi.fn()
}));

vi.mock('../../../services/http-client', () => ({
  extractErrorMessage: (_error: unknown, fallback: string) => fallback
}));

import { useRulePayload } from './useRulePayload';

function ruleFor(id: string): RuleConfig {
  return {
    id,
    type: 'promotion',
    name: id,
    version: 1,
    isActive: false,
    payload: {},
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z'
  } as RuleConfig;
}

describe('settings rule payload lifecycle', () => {
  let scope: EffectScope | undefined;

  beforeEach(() => {
    mocks.loadRule.mockReset();
  });

  afterEach(() => {
    scope?.stop();
    scope = undefined;
  });

  it('keeps detail failure visible until a retry succeeds', async () => {
    mocks.loadRule.mockRejectedValueOnce(new Error('detail unavailable')).mockResolvedValueOnce({
      payload: { enabled: true }
    });
    const rules = ref([ruleFor('rule-1')]);
    scope = effectScope();
    const state = scope.run(() => useRulePayload(() => rules.value, mocks.loadRule))!;

    await state.ensurePayload(rules.value[0]);
    expect(state.payloadErrorById['rule-1']).toBe('规则详情加载失败，请稍后重试');
    expect(state.payloadById['rule-1']).toBeUndefined();

    await state.ensurePayload(rules.value[0]);
    expect(state.payloadErrorById['rule-1']).toBeUndefined();
    expect(state.payloadById['rule-1']).toEqual({ enabled: true });
  });

  it('uses the list payload without issuing a detail request', async () => {
    const row = ruleFor('rule-inline');
    row.payload = { enabled: false };
    const rules = ref([row]);
    scope = effectScope();
    const state = scope.run(() => useRulePayload(() => rules.value, mocks.loadRule))!;

    await state.ensurePayload(row);

    expect(state.payloadById['rule-inline']).toEqual({ enabled: false });
    expect(mocks.loadRule).not.toHaveBeenCalled();
  });

  it('drops late detail results after the owning scope is disposed', async () => {
    let resolveDetail!: (value: { payload: Record<string, boolean> }) => void;
    const pending = new Promise<{ payload: Record<string, boolean> }>((resolve) => {
      resolveDetail = resolve;
    });
    mocks.loadRule.mockReturnValue(pending);
    const rules = ref([ruleFor('rule-late')]);
    scope = effectScope();
    const state = scope.run(() => useRulePayload(() => rules.value, mocks.loadRule))!;
    const load = state.ensurePayload(rules.value[0]);

    scope.stop();
    resolveDetail({ payload: { enabled: true } });
    await load;

    expect(state.payloadById['rule-late']).toBeUndefined();
    expect(state.payloadErrorById['rule-late']).toBeUndefined();
  });
});
