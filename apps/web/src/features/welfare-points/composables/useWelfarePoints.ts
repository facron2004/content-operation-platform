import { computed, onMounted, ref } from 'vue';
import {
  exportWelfarePointsCsv,
  getWelfarePointsList,
  getWelfarePointsSummary,
  type WelfarePointQuery,
  type WelfarePointRecord,
  type WelfarePointSummary
} from '../../../services/api/welfare-points.api';
import { extractErrorMessage } from '../../../services/http-client';
import {
  buildSourceBarOption,
  buildTopMembersOption,
  buildTrendOption,
  buildTypeDonutOption
} from './welfare-points-chart';

export function useWelfarePoints() {
  const phone = ref('');
  const pointType = ref<'1' | '2' | ''>('');
  const sourceType = ref<string>('');
  const keyword = ref('');
  const dateFrom = ref('');
  const dateTo = ref('');
  const dateRange = computed({
    get: () => (dateFrom.value || dateTo.value ? [dateFrom.value, dateTo.value] : null),
    set: (value: [string, string] | null) => {
      dateFrom.value = value?.[0] ?? '';
      dateTo.value = value?.[1] ?? '';
    }
  });

  const page = ref(1);
  const pageSize = ref(20);

  const summary = ref<WelfarePointSummary | null>(null);
  const list = ref<WelfarePointRecord[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const listLoading = ref(false);
  const loadError = ref('');
  const cached = ref(false);

  function buildParams(force = false): WelfarePointQuery {
    const p: WelfarePointQuery = {
      page: page.value,
      pageSize: pageSize.value,
      phone: phone.value || undefined,
      pointType: (pointType.value || undefined) as '1' | '2' | undefined,
      sourceType: sourceType.value || undefined,
      dateFrom: dateFrom.value || undefined,
      dateTo: dateTo.value || undefined,
      keyword: keyword.value || undefined,
      reload: force || undefined
    };
    return p;
  }

  async function loadSummary(force = false) {
    loading.value = true;
    loadError.value = '';
    try {
      const data = await getWelfarePointsSummary(buildParams(force));
      summary.value = data;
      cached.value = data.cached;
    } catch (e) {
      loadError.value = extractErrorMessage(e, '福利金数据加载失败');
    } finally {
      loading.value = false;
    }
  }

  async function loadList() {
    listLoading.value = true;
    try {
      const data = await getWelfarePointsList(buildParams());
      list.value = data.list;
      total.value = data.total;
    } catch (e) {
      loadError.value = extractErrorMessage(e, '福利金记录加载失败');
    } finally {
      listLoading.value = false;
    }
  }

  async function reload(force = false) {
    await Promise.all([loadSummary(force), loadList()]);
  }

  function applyFilters() {
    page.value = 1;
    void reload();
  }

  function resetFilters() {
    phone.value = '';
    pointType.value = '';
    sourceType.value = '';
    keyword.value = '';
    dateFrom.value = '';
    dateTo.value = '';
    page.value = 1;
    void reload();
  }

  function changePage(next: number) {
    page.value = next;
    void loadList();
  }

  function exportCsv() {
    return exportWelfarePointsCsv(buildParams());
  }

  // chart options
  const trendOption = computed(() => (summary.value ? buildTrendOption(summary.value.dailyTrend) : {}));
  const typeOption = computed(() => (summary.value ? buildTypeDonutOption(summary.value.byType) : {}));
  const sourceOption = computed(() => (summary.value ? buildSourceBarOption(summary.value.bySource) : {}));
  const topMembersOption = computed(() =>
    summary.value ? buildTopMembersOption(summary.value.topMembers) : {}
  );

  onMounted(() => void reload());

  return {
    // filters
    phone,
    pointType,
    sourceType,
    keyword,
    dateRange,
    // pagination
    page,
    pageSize,
    total,
    changePage,
    // state
    summary,
    list,
    loading,
    listLoading,
    loadError,
    cached,
    // actions
    applyFilters,
    resetFilters,
    reload,
    exportCsv,
    // charts
    trendOption,
    typeOption,
    sourceOption,
    topMembersOption
  };
}
