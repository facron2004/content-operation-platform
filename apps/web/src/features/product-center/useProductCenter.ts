import { computed, onScopeDispose, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  getProductCenterProduct,
  getProductCenterProducts,
  type ProductCenterDetailResponse,
  type ProductCenterItem,
  type ProductCenterListResponse,
  type ProductInventoryStatus
} from '../../services/api/product-center.api';
import { formatFenYuan } from '../../utils/format';

const PAGE_SIZE = 20;

export function useProductCenter() {
  const route = useRoute();
  const router = useRouter();
  const search = ref(typeof route.query.search === 'string' ? route.query.search : '');
  const inventoryStatus = ref<ProductInventoryStatus>(
    typeof route.query.inventoryStatus === 'string' &&
      ['all', 'normal', 'low', 'out'].includes(route.query.inventoryStatus)
      ? (route.query.inventoryStatus as ProductInventoryStatus)
      : 'all'
  );
  const page = ref(Number(route.query.page) > 0 ? Number(route.query.page) : 1);
  const loading = ref(false);
  const detailLoading = ref(false);
  const error = ref<string | null>(null);
  const detailError = ref<string | null>(null);
  const items = ref<ProductCenterItem[]>([]);
  const selectedPackageId = ref(
    typeof route.params.productId === 'string'
      ? route.params.productId
      : typeof route.params.inventoryId === 'string'
        ? route.params.inventoryId
        : typeof route.query.packageId === 'string'
          ? route.query.packageId
          : ''
  );
  const detail = ref<ProductCenterDetailResponse | null>(null);
  const summary = ref<ProductCenterListResponse['summary']>({
    totalSkus: 0,
    activeSkus: 0,
    lowStockSkus: 0,
    outOfStockSkus: 0,
    stockTotal: 0,
    stockLeft: 0
  });
  const pagination = ref<ProductCenterListResponse['pagination']>({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    hasMore: false
  });
  let disposed = false;
  let listRequestId = 0;
  let detailRequestId = 0;

  const selectedProduct = computed(() => detail.value?.product ?? null);

  async function reload() {
    const requestId = ++listRequestId;
    loading.value = true;
    error.value = null;
    try {
      const response = await getProductCenterProducts({
        search: search.value.trim() || undefined,
        inventoryStatus: inventoryStatus.value,
        page: page.value,
        pageSize: PAGE_SIZE
      });
      if (disposed || requestId !== listRequestId) return;
      items.value = response.items;
      summary.value = response.summary;
      pagination.value = response.pagination;
      const current = selectedPackageId.value;
      if (current) {
        await loadDetail(current);
      } else if (response.items[0]) {
        await selectProduct(response.items[0].packageId, false);
      } else {
        selectedPackageId.value = '';
        detail.value = null;
      }
    } catch (cause) {
      if (!disposed && requestId === listRequestId) {
        error.value = cause instanceof Error ? cause.message : '商品列表加载失败';
      }
    } finally {
      if (!disposed && requestId === listRequestId) loading.value = false;
    }
  }

  async function loadDetail(packageId: string) {
    const requestId = ++detailRequestId;
    detailLoading.value = true;
    detailError.value = null;
    try {
      const response = await getProductCenterProduct(packageId);
      if (disposed || requestId !== detailRequestId) return;
      detail.value = response;
    } catch (cause) {
      if (!disposed && requestId === detailRequestId) {
        detailError.value = cause instanceof Error ? cause.message : '商品详情加载失败';
      }
    } finally {
      if (!disposed && requestId === detailRequestId) detailLoading.value = false;
    }
  }

  async function selectProduct(packageId: string, updateRoute = true) {
    if (disposed || !packageId) return;
    selectedPackageId.value = packageId;
    if (updateRoute) {
      await router.replace({
        query: {
          search: search.value || undefined,
          inventoryStatus: inventoryStatus.value !== 'all' ? inventoryStatus.value : undefined,
          page: page.value > 1 ? String(page.value) : undefined,
          packageId
        }
      });
    }
    await loadDetail(packageId);
  }

  async function applyFilters() {
    page.value = 1;
    selectedPackageId.value = '';
    detail.value = null;
    await router.replace({
      query: {
        search: search.value || undefined,
        inventoryStatus: inventoryStatus.value !== 'all' ? inventoryStatus.value : undefined
      }
    });
    await reload();
  }

  async function setPage(nextPage: number) {
    if (nextPage < 1 || nextPage === page.value) return;
    page.value = nextPage;
    selectedPackageId.value = '';
    detail.value = null;
    await router.replace({
      query: {
        search: search.value || undefined,
        inventoryStatus: inventoryStatus.value !== 'all' ? inventoryStatus.value : undefined,
        page: nextPage > 1 ? String(nextPage) : undefined
      }
    });
    await reload();
  }

  function displayFen(fen: string | null | undefined) {
    return formatFenYuan(fen);
  }

  function displayDate(value: string | null | undefined) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(value));
  }

  function displayDateTime(value: string | null | undefined) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  }

  function inventoryLabel(value: string) {
    return { normal: '库存正常', low: '库存偏低', out: '已售罄' }[value] ?? '未标注';
  }

  function inventoryType(value: string): 'success' | 'warning' | 'danger' | 'info' {
    if (value === 'normal') return 'success';
    if (value === 'low') return 'warning';
    if (value === 'out') return 'danger';
    return 'info';
  }

  reload();
  onScopeDispose(() => {
    disposed = true;
    listRequestId += 1;
    detailRequestId += 1;
  });

  return {
    search,
    inventoryStatus,
    page,
    loading,
    detailLoading,
    error,
    detailError,
    items,
    selectedPackageId,
    selectedProduct,
    detail,
    summary,
    pagination,
    reload,
    applyFilters,
    setPage,
    selectProduct,
    displayFen,
    displayDate,
    displayDateTime,
    inventoryLabel,
    inventoryType
  };
}
