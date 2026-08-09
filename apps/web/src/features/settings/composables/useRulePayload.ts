import { onScopeDispose, reactive, watch } from 'vue';
import type { RuleConfig, RuleConfigPayload } from '@content/shared';
import { extractErrorMessage } from '../../../services/http-client';

type RuleDetailResponse = { payload?: unknown } | null;
type RuleDetailLoader = (id: string) => Promise<RuleDetailResponse>;

export function useRulePayload(getRules: () => RuleConfig[], loadRule: RuleDetailLoader) {
  const payloadById = reactive<Record<string, RuleConfigPayload>>({});
  const payloadErrorById = reactive<Record<string, string>>({});
  const loadingById = reactive<Record<string, boolean>>({});
  const inflight = new Map<string, Promise<RuleConfigPayload | null>>();
  let disposed = false;
  let generation = 0;

  function clearCachedPayloads(): void {
    for (const key of Object.keys(payloadById)) delete payloadById[key];
    for (const key of Object.keys(payloadErrorById)) delete payloadErrorById[key];
    for (const key of Object.keys(loadingById)) delete loadingById[key];
    inflight.clear();
  }

  watch(
    () =>
      getRules()
        .map((rule) => rule.id)
        .join('|'),
    () => {
      generation += 1;
      clearCachedPayloads();
    }
  );

  async function ensurePayload(row: RuleConfig): Promise<void> {
    if (disposed || payloadById[row.id] !== undefined) return;

    const listPayload = row.payload;
    if (listPayload && typeof listPayload === 'object' && Object.keys(listPayload).length > 0) {
      payloadById[row.id] = listPayload;
      delete payloadErrorById[row.id];
      return;
    }

    let pending = inflight.get(row.id);
    if (!pending) {
      const requestGeneration = generation;
      loadingById[row.id] = true;
      pending = loadRule(row.id)
        .then((detail) => {
          if (disposed || requestGeneration !== generation) return null;
          const payload = (detail?.payload ?? {}) as RuleConfigPayload;
          payloadById[row.id] = payload;
          delete payloadErrorById[row.id];
          return payload;
        })
        .catch((error) => {
          if (!disposed && requestGeneration === generation) {
            delete payloadById[row.id];
            payloadErrorById[row.id] = extractErrorMessage(error, '规则详情加载失败，请稍后重试');
          }
          return null;
        })
        .finally(() => {
          if (!disposed && requestGeneration === generation) loadingById[row.id] = false;
          if (inflight.get(row.id) === pending) inflight.delete(row.id);
        });
      inflight.set(row.id, pending);
    }
    await pending;
  }

  onScopeDispose(() => {
    disposed = true;
    generation += 1;
    clearCachedPayloads();
  }, true);

  return { payloadById, payloadErrorById, loadingById, ensurePayload };
}
