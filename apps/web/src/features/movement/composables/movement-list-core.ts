import { computed, onMounted, onScopeDispose, ref, type Ref } from 'vue';
import {
  getMovementMoving,
  getMovementStagnant,
  getMovementToday,
  type MovementSkuRow,
  type MovementTodayPayload,
  type StaleBucket
} from '../../../services/api/movement.api';
import { extractErrorMessage } from '../../../services/http-client';

export type MovementListFilters = {
  bucket: StaleBucket;
  days: 1 | 7 | 30;
  search?: string;
  sort: 'lastSalesDateAsc' | 'staleDesc' | 'gmvDesc';
  // Residual #214: API MovementSkusQueryDto / MovementMovingQueryDto already apply these.
  merchantId?: string;
  category?: string;
  areaId?: string;
};

export type MovementListState = {
  loading: Ref<boolean>;
  listLoading: Ref<boolean>;
  loadError: Ref<string | null>;
  today: Ref<MovementTodayPayload | null>;
  // Residual #227: as-of business day (getMovementToday already accepts date).
  // Empty string means "server default today".
  kpiDate: Ref<string>;
  rows: Ref<MovementSkuRow[]>;
  activeTab: Ref<'stagnant' | 'moving'>;
  filters: Ref<MovementListFilters>;
  page: Ref<number>;
  hasMore: Ref<boolean>;
  // Residual #266: MOVEMENT_CACHE_CAP honesty.
  listTruncated: Ref<boolean>;
  listLimit: Ref<number | null>;
};

const PAGE_SIZE = 20;

function createDefaultMovementFilters(): MovementListFilters {
  return {
    bucket: 'stale_30d',
    days: 7,
    search: undefined,
    sort: 'lastSalesDateAsc',
    merchantId: undefined,
    category: undefined,
    areaId: undefined
  };
}

export function createMovementListState(): MovementListState {
  return {
    loading: ref(false),
    listLoading: ref(false),
    loadError: ref<string | null>(null),
    today: ref<MovementTodayPayload | null>(null),
    kpiDate: ref(''),
    rows: ref<MovementSkuRow[]>([]),
    activeTab: ref<'stagnant' | 'moving'>('stagnant'),
    filters: ref<MovementListFilters>(createDefaultMovementFilters()),
    page: ref(1),
    hasMore: ref(false),
    // Residual #266: MOVEMENT_CACHE_CAP honesty.
    listTruncated: ref(false),
    listLimit: ref<number | null>(null)
  };
}

async function loadMovementToday(params: {
  today: Ref<MovementTodayPayload | null>;
  loadError: Ref<string | null>;
  isCurrent: () => boolean;
  // Residual #227: as-of business day.
  date?: string;
}): Promise<void> {
  try {
    const result = await getMovementToday(params.date || undefined);
    if (!params.isCurrent()) return;
    params.today.value = result;
  } catch (err) {
    if (!params.isCurrent()) return;
    params.loadError.value = extractErrorMessage(err, '加载今日动销汇总失败');
  }
}

async function loadMovementList(params: {
  activeTab: Ref<'stagnant' | 'moving'>;
  filters: Ref<MovementListFilters>;
  page: Ref<number>;
  rows: Ref<MovementSkuRow[]>;
  hasMore: Ref<boolean>;
  listLoading: Ref<boolean>;
  loadError: Ref<string | null>;
  isCurrent: () => boolean;
  // Residual #266: optional honesty sinks for MOVEMENT_CACHE_CAP.
  listTruncated?: Ref<boolean>;
  listLimit?: Ref<number | null>;
}): Promise<void> {
  params.listLoading.value = true;
  try {
    const f = params.filters.value;
    // Residual #214: pass merchantId/category/areaId (API+client existed; SPA unwired).
    const result =
      params.activeTab.value === 'stagnant'
        ? await getMovementStagnant({
            bucket: f.bucket,
            search: f.search,
            sort: f.sort,
            merchantId: f.merchantId || undefined,
            category: f.category || undefined,
            areaId: f.areaId || undefined,
            page: params.page.value,
            pageSize: PAGE_SIZE
          })
        : await getMovementMoving({
            days: f.days,
            search: f.search,
            merchantId: f.merchantId || undefined,
            category: f.category || undefined,
            areaId: f.areaId || undefined,
            page: params.page.value,
            pageSize: PAGE_SIZE
          });
    if (!params.isCurrent()) return;
    params.rows.value = result.items;
    params.hasMore.value = result.pagination.hasMore;
    if (params.listTruncated) params.listTruncated.value = Boolean(result.truncated);
    if (params.listLimit)
      params.listLimit.value =
        typeof result.limit === 'number' && result.limit > 0 ? result.limit : null;
  } catch (err) {
    if (!params.isCurrent()) return;
    params.loadError.value = extractErrorMessage(err, '加载清单失败');
  } finally {
    if (params.isCurrent()) params.listLoading.value = false;
  }
}

export function createMovementPagination(options: {
  page: Ref<number>;
  hasMore: Ref<boolean>;
  loadList: () => Promise<void> | void;
}) {
  return {
    prevPage() {
      if (options.page.value > 1) {
        options.page.value -= 1;
        options.loadList();
      }
    },
    nextPage() {
      if (options.hasMore.value) {
        options.page.value += 1;
        options.loadList();
      }
    },
    onTabChange() {
      options.page.value = 1;
      options.loadList();
    },
    onBucketClick(bucket: StaleBucket, setBucket: (b: StaleBucket) => void, setTab: () => void) {
      setBucket(bucket);
      setTab();
      options.page.value = 1;
      options.loadList();
    }
  };
}

export function bindMovementListLoaders(state: MovementListState) {
  let disposed = false;
  let listRequestId = 0;
  let todayRequestId = 0;
  let reloadRequestId = 0;

  const loadList = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    const currentRequestId = ++listRequestId;
    return loadMovementList({
      activeTab: state.activeTab,
      filters: state.filters,
      page: state.page,
      rows: state.rows,
      hasMore: state.hasMore,
      listLoading: state.listLoading,
      loadError: state.loadError,
      isCurrent: () => !disposed && currentRequestId === listRequestId,
      listTruncated: state.listTruncated,
      listLimit: state.listLimit
    });
  };

  async function reload() {
    if (disposed) return;
    const currentReloadId = ++reloadRequestId;
    const currentTodayRequestId = ++todayRequestId;
    state.loading.value = true;
    state.loadError.value = null;
    await Promise.all([
      loadMovementToday({
        today: state.today,
        loadError: state.loadError,
        isCurrent: () => !disposed && currentTodayRequestId === todayRequestId,
        date: state.kpiDate.value || undefined
      }),
      loadList()
    ]);
    if (!disposed && currentReloadId === reloadRequestId) state.loading.value = false;
  }

  onScopeDispose(() => {
    disposed = true;
    listRequestId += 1;
    todayRequestId += 1;
    reloadRequestId += 1;
    state.loading.value = false;
    state.listLoading.value = false;
  });

  onMounted(reload);
  return {
    loadList,
    reload,
    emptyText: computed(() =>
      state.listLoading.value ? '加载中…' : state.rows.value.length === 0 ? '暂无数据' : ''
    )
  };
}
