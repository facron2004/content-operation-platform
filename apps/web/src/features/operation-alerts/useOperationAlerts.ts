import { computed, onMounted, onScopeDispose, ref } from 'vue';
import { beijingDateKey } from '@content/shared';
import {
  getGmvByMerchant,
  getGmvToday,
  type GmvKpi,
  type GmvMerchantRow
} from '../../services/api/gmv.api';
import { extractErrorMessage } from '../../services/http-client';
import {
  buildOperationAlerts,
  HIGH_REFUND_RATE,
  LOW_VERIFY_RATE,
  type OperationAlert,
  type OperationAlertLevel
} from './operation-alerts';

export type OperationGlobalAlert = {
  id: string;
  level: OperationAlertLevel;
  title: string;
  description: string;
};

type MerchantFactCoverage = {
  rows: GmvMerchantRow[];
  truncated: boolean;
  limit: number | null;
};

export function useOperationAlerts() {
  const todayText = beijingDateKey();
  const kpiDate = ref(todayText);
  const loading = ref(false);
  const loadError = ref<string | null>(null);
  const kpi = ref<GmvKpi | null>(null);
  const merchants = ref<GmvMerchantRow[]>([]);
  const merchantTruncated = ref(false);
  const merchantLimit = ref<number | null>(null);
  const disposed = ref(false);
  let requestId = 0;

  const alerts = computed<OperationAlert[]>(() => buildOperationAlerts(merchants.value));
  const refundAlerts = computed(() => alerts.value.filter((item) => item.kind === 'refund'));
  const verifyAlerts = computed(() => alerts.value.filter((item) => item.kind === 'verify'));
  const globalAlerts = computed<OperationGlobalAlert[]>(() => {
    if (!kpi.value || kpi.value.paidOrderCount < 3) return [];
    const result: OperationGlobalAlert[] = [];
    if (kpi.value.refundRate >= HIGH_REFUND_RATE) {
      result.push({
        id: 'global-refund',
        level: kpi.value.refundRate >= 0.08 ? 'danger' : 'warning',
        title: '全平台退款率偏高',
        description: `当前退款率 ${formatRatio(kpi.value.refundRate)}，建议优先排查高退款率商家。`
      });
    }
    if (kpi.value.verifyRate < LOW_VERIFY_RATE) {
      result.push({
        id: 'global-verify',
        level: kpi.value.verifyRate < 0.3 ? 'danger' : 'warning',
        title: '全平台核销率偏低',
        description: `当前核销率 ${formatRatio(kpi.value.verifyRate)}，建议检查到店履约和核销引导。`
      });
    }
    return result;
  });

  async function load(force = false) {
    if (disposed.value) return;
    const id = ++requestId;
    const date = kpiDate.value;
    loading.value = true;
    loadError.value = null;
    try {
      const [nextKpi, merchantPage] = await Promise.all([
        getGmvToday(date, force),
        loadAllMerchantFacts(date, force)
      ]);
      if (disposed.value || id !== requestId) return;
      kpi.value = nextKpi;
      merchants.value = merchantPage.rows;
      merchantTruncated.value = merchantPage.truncated;
      merchantLimit.value = merchantPage.limit;
    } catch (error) {
      if (!disposed.value && id === requestId) {
        loadError.value = extractErrorMessage(error, '加载经营预警失败');
      }
    } finally {
      if (!disposed.value && id === requestId) loading.value = false;
    }
  }

  async function loadAllMerchantFacts(date: string, force = false): Promise<MerchantFactCoverage> {
    const rows: GmvMerchantRow[] = [];
    let page = 1;
    let hasMore = true;
    let truncated = false;
    let limit: number | null = null;
    // The API caps the materialized merchant ranking at 1,000 rows (100/page).
    while (hasMore && page <= 10) {
      const result = await getGmvByMerchant('gmvDesc', page, 100, force && page === 1, date);
      rows.push(...(result.items ?? []));
      hasMore = Boolean(result.hasMore);
      truncated ||= Boolean(result.truncated);
      if (typeof result.limit === 'number' && Number.isFinite(result.limit)) limit = result.limit;
      page += 1;
    }
    return { rows, truncated, limit };
  }

  function onDateChange(date: string) {
    kpiDate.value = date || todayText;
    void load();
  }

  function disableFutureDate(date: Date) {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return date.getTime() > today.getTime();
  }

  onMounted(() => void load());
  onScopeDispose(() => {
    disposed.value = true;
    requestId += 1;
  });

  return {
    todayText,
    kpiDate,
    loading,
    loadError,
    kpi,
    merchants,
    merchantTruncated,
    merchantLimit,
    alerts,
    refundAlerts,
    verifyAlerts,
    globalAlerts,
    onDateChange,
    disableFutureDate,
    load
  };
}

function formatRatio(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}
