import { onScopeDispose, ref } from 'vue';
import {
  getZeroSalesTimeline,
  type ZeroSalesSkuRow,
  type ZeroSalesTimelineResponse
} from '../../../services/api/zero-sales.api';
import { extractErrorMessage } from '../../../services/http-client';
import { isRequestCanceled } from '../../../services/http-client-utils';

/** Residual #234: API ZeroSalesTimelineQueryDto days Min(7) Max(90). */
export const TIMELINE_DAY_OPTIONS = [7, 14, 30, 60, 90] as const;
export type TimelineDayOption = (typeof TIMELINE_DAY_OPTIONS)[number];

function clampTimelineDays(raw: number | undefined): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.trunc(raw) : 30;
  if (n < 7) return 7;
  if (n > 90) return 90;
  return n;
}

/**
 * Residual #211: zero-sales SKU stock/sales timeline drawer.
 * API GET /zero-sales/skus/:packageId/timeline + SPA client existed unused.
 * Mirrors residual #210 movement timeline.
 * Residual #234: days is operator-selectable (API 7–90), not hard-coded 30.
 */
export function useZeroSalesTimeline() {
  const drawerVisible = ref(false);
  const loading = ref(false);
  const packageId = ref<string | null>(null);
  const packageName = ref('');
  const merchantName = ref('');
  const days = ref(30);
  const timeline = ref<ZeroSalesTimelineResponse['timeline']>([]);
  const timelineError = ref<string | null>(null);
  let disposed = false;
  let requestId = 0;

  async function fetchTimeline(id: string, dayCount: number) {
    if (disposed) return;
    const currentRequestId = ++requestId;
    loading.value = true;
    timelineError.value = null;
    try {
      const res = await getZeroSalesTimeline(id, dayCount);
      if (disposed || currentRequestId !== requestId) return;
      timeline.value = res?.timeline ?? [];
      if (typeof res?.days === 'number' && res.days > 0) {
        days.value = clampTimelineDays(res.days);
      }
    } catch (cause) {
      if (disposed || currentRequestId !== requestId) return;
      if (!isRequestCanceled(cause)) {
        const message = extractErrorMessage(cause, '加载零动销时间线失败');
        timeline.value = [];
        timelineError.value = message;
      }
    } finally {
      if (!disposed && currentRequestId === requestId) loading.value = false;
    }
  }

  async function open(
    row: Pick<ZeroSalesSkuRow, 'packageId' | 'packageName' | 'merchantName'>,
    opts?: { days?: number }
  ) {
    if (disposed) return;
    packageId.value = row.packageId;
    packageName.value = row.packageName ?? '';
    merchantName.value = row.merchantName ?? '';
    days.value = clampTimelineDays(opts?.days);
    timeline.value = [];
    timelineError.value = null;
    drawerVisible.value = true;
    await fetchTimeline(row.packageId, days.value);
  }

  /** Residual #234: re-fetch open package with a new window (7–90). */
  async function setDays(next: number) {
    if (disposed) return;
    const clamped = clampTimelineDays(next);
    if (clamped === days.value && timeline.value.length > 0) return;
    days.value = clamped;
    const id = packageId.value;
    if (!id || !drawerVisible.value) return;
    await fetchTimeline(id, clamped);
  }

  function close() {
    requestId += 1;
    drawerVisible.value = false;
    loading.value = false;
  }

  onScopeDispose(() => {
    disposed = true;
    requestId += 1;
    loading.value = false;
  }, true);

  return {
    drawerVisible,
    loading,
    packageId,
    packageName,
    merchantName,
    days,
    timeline,
    error: timelineError,
    open,
    setDays,
    close
  };
}
