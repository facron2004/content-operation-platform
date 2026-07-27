import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  getMovementTimeline,
  type MovementSkuRow,
  type MovementTimelineResponse
} from '../../../services/api/movement.api';
import { extractErrorMessage } from '../../../services/http-client';

/** Residual #234: API MovementTimelineQueryDto days Min(7) Max(90). */
export const TIMELINE_DAY_OPTIONS = [7, 14, 30, 60, 90] as const;
export type TimelineDayOption = (typeof TIMELINE_DAY_OPTIONS)[number];

function clampTimelineDays(raw: number | undefined): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.trunc(raw) : 30;
  if (n < 7) return 7;
  if (n > 90) return 90;
  return n;
}

/**
 * Residual #210: movement SKU stock/sales timeline drawer.
 * API GET /movement/skus/:packageId/timeline + SPA client existed unused.
 * Residual #234: days is operator-selectable (API 7–90), not hard-coded 30.
 */
export function useMovementTimeline() {
  const drawerVisible = ref(false);
  const loading = ref(false);
  const packageId = ref<string | null>(null);
  const packageName = ref('');
  const merchantName = ref('');
  const days = ref(30);
  const timeline = ref<MovementTimelineResponse['timeline']>([]);

  async function fetchTimeline(id: string, dayCount: number) {
    loading.value = true;
    try {
      const res = await getMovementTimeline(id, dayCount);
      timeline.value = res?.timeline ?? [];
      if (typeof res?.days === 'number' && res.days > 0) {
        days.value = clampTimelineDays(res.days);
      }
    } catch (error) {
      ElMessage.error(extractErrorMessage(error, '加载动销时间线失败'));
      timeline.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function open(
    row: Pick<MovementSkuRow, 'packageId' | 'packageName' | 'merchantName'>,
    opts?: { days?: number }
  ) {
    packageId.value = row.packageId;
    packageName.value = row.packageName ?? '';
    merchantName.value = row.merchantName ?? '';
    days.value = clampTimelineDays(opts?.days);
    timeline.value = [];
    drawerVisible.value = true;
    await fetchTimeline(row.packageId, days.value);
  }

  /** Residual #234: re-fetch open package with a new window (7–90). */
  async function setDays(next: number) {
    const clamped = clampTimelineDays(next);
    if (clamped === days.value && timeline.value.length > 0) return;
    days.value = clamped;
    const id = packageId.value;
    if (!id || !drawerVisible.value) return;
    await fetchTimeline(id, clamped);
  }

  function close() {
    drawerVisible.value = false;
  }

  return {
    drawerVisible,
    loading,
    packageId,
    packageName,
    merchantName,
    days,
    timeline,
    open,
    setDays,
    close
  };
}
