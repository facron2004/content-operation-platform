import { computed, onMounted, ref, type Ref } from 'vue';
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
};

export type MovementListState = {
  loading: Ref<boolean>;
  listLoading: Ref<boolean>;
  loadError: Ref<string | null>;
  today: Ref<MovementTodayPayload | null>;
  rows: Ref<MovementSkuRow[]>;
  activeTab: Ref<'stagnant' | 'moving'>;
  filters: Ref<MovementListFilters>;
  page: Ref<number>;
  hasMore: Ref<boolean>;
};

const PAGE_SIZE = 20;

function createDefaultMovementFilters(): MovementListFilters {
  return { bucket: 'stale_30d', days: 7, search: undefined, sort: 'lastSalesDateAsc' };
}

export function createMovementListState(): MovementListState {
  return {
    loading: ref(false),
    listLoading: ref(false),
    loadError: ref<string | null>(null),
    today: ref<MovementTodayPayload | null>(null),
    rows: ref<MovementSkuRow[]>([]),
    activeTab: ref<'stagnant' | 'moving'>('stagnant'),
    filters: ref<MovementListFilters>(createDefaultMovementFilters()),
    page: ref(1),
    hasMore: ref(false)
  };
}

async function loadMovementToday(params: {
  today: Ref<MovementTodayPayload | null>;
  loadError: Ref<string | null>;
}): Promise<void> {
  try {
    params.today.value = await getMovementToday();
  } catch (err) {
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
}): Promise<void> {
  params.listLoading.value = true;
  try {
    if (params.activeTab.value === 'stagnant') {
      const result = await getMovementStagnant({
        bucket: params.filters.value.bucket,
        search: params.filters.value.search,
        sort: params.filters.value.sort,
        page: params.page.value,
        pageSize: PAGE_SIZE
      });
      params.rows.value = result.items;
      params.hasMore.value = result.pagination.hasMore;
    } else {
      const result = await getMovementMoving({
        days: params.filters.value.days,
        search: params.filters.value.search,
        page: params.page.value,
        pageSize: PAGE_SIZE
      });
      params.rows.value = result.items;
      params.hasMore.value = result.pagination.hasMore;
    }
  } catch (err) {
    params.loadError.value = extractErrorMessage(err, '加载清单失败');
  } finally {
    params.listLoading.value = false;
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
  const loadList = () =>
    loadMovementList({
      activeTab: state.activeTab,
      filters: state.filters,
      page: state.page,
      rows: state.rows,
      hasMore: state.hasMore,
      listLoading: state.listLoading,
      loadError: state.loadError
    });
  async function reload() {
    state.loading.value = true;
    state.loadError.value = null;
    await Promise.all([
      loadMovementToday({ today: state.today, loadError: state.loadError }),
      loadList()
    ]);
    state.loading.value = false;
  }
  onMounted(reload);
  return {
    loadList,
    reload,
    emptyText: computed(() =>
      state.listLoading.value ? '加载中…' : state.rows.value.length === 0 ? '暂无数据' : ''
    )
  };
}
