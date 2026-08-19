import { computed, h, onMounted, ref } from 'vue';
import { ElNotification } from 'element-plus';
import {
  exportMemberIntegralCsv,
  getMemberIntegralCount,
  getMemberIntegralRecords,
  getMemberIntegralSummary,
  refreshMemberIntegral,
  type MemberIntegralQuery,
  type MemberIntegralRecord,
  type MemberIntegralSummary
} from '../../services/api/member-integral.api';
import { extractErrorMessage } from '../../services/http-client';
import {
  buildStateBarOption,
  buildTopMembersOption,
  buildTrendOption,
  buildTypeDonutOption
} from './member-integral-chart';

export function useMemberIntegralRecords() {
  const phone = ref('');
  const integralType = ref<string>('');
  const state = ref<string>('');
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

  const summary = ref<MemberIntegralSummary | null>(null);
  const list = ref<MemberIntegralRecord[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const listLoading = ref(false);
  const syncing = ref(false);
  const loadError = ref('');
  const cached = ref(false);

  function buildParams(): MemberIntegralQuery {
    const p: MemberIntegralQuery = {
      page: page.value,
      pageSize: pageSize.value,
      phone: phone.value || undefined,
      integralType: integralType.value || undefined,
      state: state.value || undefined,
      dateFrom: dateFrom.value || undefined,
      dateTo: dateTo.value || undefined,
      keyword: keyword.value || undefined
    };
    return p;
  }

  async function loadSummary(bypassCache = false) {
    loading.value = true;
    loadError.value = '';
    try {
      const data = await getMemberIntegralSummary(buildParams(), bypassCache);
      summary.value = data;
      cached.value = data.cached;
    } catch (e) {
      loadError.value = extractErrorMessage(e, '积分数据加载失败');
    } finally {
      loading.value = false;
    }
  }

  async function loadList(bypassCache = false) {
    listLoading.value = true;
    try {
      const data = await getMemberIntegralRecords(buildParams(), bypassCache);
      list.value = data.list;
      total.value = data.total;
    } catch (e) {
      loadError.value = extractErrorMessage(e, '积分记录加载失败');
    } finally {
      listLoading.value = false;
    }
  }

  async function reload(syncUpstream = false) {
    if (!syncUpstream) {
      await Promise.all([loadSummary(), loadList()]);
      return;
    }

    syncing.value = true;
    loadError.value = '';
    const notif = ElNotification({
      title: '同步积分数据',
      message: h('div', { id: 'mi-sync-progress' }, '正在拉取全量数据，请稍候...'),
      type: 'info',
      duration: 0,
      showClose: true
    });

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let lastCount = 0;
    const updateProgress = (text: string) => {
      const el = document.getElementById('mi-sync-progress');
      if (el) el.textContent = text;
    };

    try {
      // Poll the local row count every 3s — fetchAll persists each page as it
      // lands, so this reflects real sync progress without hitting JeeSite.
      pollTimer = setInterval(async () => {
        try {
          const c = await getMemberIntegralCount();
          if (c !== lastCount) {
            lastCount = c;
            updateProgress(`已同步 ${c.toLocaleString('zh-CN')} 条...`);
          }
        } catch {
          /* 忽略轮询错误，进度条不阻塞主流程 */
        }
      }, 3000);

      const result = await refreshMemberIntegral();
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      notif.close();
      ElNotification({
        title: '同步完成',
        message: `共同步 ${result.total.toLocaleString('zh-CN')} 条积分记录`,
        type: 'success',
        duration: 4000
      });
      // The sync endpoint finishes first and invalidates all cached pages. Both
      // reads then bypass the Web cache and observe the same fresh API snapshot.
      await Promise.all([loadSummary(true), loadList(true)]);
    } catch (e) {
      if (pollTimer) clearInterval(pollTimer);
      notif.close();
      loadError.value = extractErrorMessage(e, '积分数据同步失败');
      ElNotification({
        title: '同步失败',
        message: loadError.value,
        type: 'error',
        duration: 5000
      });
    } finally {
      syncing.value = false;
    }
  }

  function applyFilters() {
    page.value = 1;
    void reload();
  }

  function resetFilters() {
    phone.value = '';
    integralType.value = '';
    state.value = '';
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
    return exportMemberIntegralCsv(buildParams());
  }

  // chart options
  const trendOption = computed(() =>
    summary.value ? buildTrendOption(summary.value.dailyTrend) : {}
  );
  const typeOption = computed(() =>
    summary.value ? buildTypeDonutOption(summary.value.byType) : {}
  );
  const stateOption = computed(() =>
    summary.value ? buildStateBarOption(summary.value.byState) : {}
  );
  const topMembersOption = computed(() =>
    summary.value ? buildTopMembersOption(summary.value.topMembers) : {}
  );

  onMounted(() => void reload());

  return {
    // filters
    phone,
    integralType,
    state,
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
    syncing,
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
    stateOption,
    topMembersOption
  };
}
