import { computed, onScopeDispose, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  getProductCenterProduct,
  getProductCenterProducts,
  syncMerchantsFromJeeSite,
  type ProductCenterDetailResponse,
  type ProductCenterItem,
  type ProductCenterListResponse,
  type ProductInventoryStatus,
  type ProductSaleFilter
} from '../../services/api/product-center.api';
import { useRoleStore } from '../../stores/role';
import { formatFenYuan } from '../../utils/format';

const PAGE_SIZE = 20;

export function useProductCenter() {
  const route = useRoute();
  const router = useRouter();
  const roleStore = useRoleStore();
  const search = ref(typeof route.query.search === 'string' ? route.query.search : '');
  const inventoryStatus = ref<ProductInventoryStatus>(
    typeof route.query.inventoryStatus === 'string' &&
      ['all', 'normal', 'low', 'out'].includes(route.query.inventoryStatus)
      ? (route.query.inventoryStatus as ProductInventoryStatus)
      : 'all'
  );
  const saleStatus = ref<ProductSaleFilter>(
    typeof route.query.saleStatus === 'string' &&
      ['all', 'pending', 'selling', 'recycle'].includes(route.query.saleStatus)
      ? (route.query.saleStatus as ProductSaleFilter)
      : 'all'
  );
  const page = ref(Number(route.query.page) > 0 ? Number(route.query.page) : 1);
  const loading = ref(false);
  const detailLoading = ref(false);
  const syncing = ref(false);
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
    stockLeft: 0,
    initialStock: 0,
    currentStock: 0,
    dailyStock: 0
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
        saleStatus: saleStatus.value !== 'all' ? saleStatus.value : undefined,
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

  /**
   * 「同步并刷新」：admin 先触发 JeeSite 同步把 ContentPackage 写到最新，再 reload 本地列表。
   * 非 admin 或同步失败时降级为仅 reload 本地数据，保证按钮始终可用。
   */
  async function syncAndReload() {
    if (disposed || syncing.value) return;
    if (!roleStore.isAdmin) {
      await reload();
      return;
    }
    syncing.value = true;
    try {
      ElMessage.info('正在从 JeeSite 同步套餐数据…');
      const result = await syncMerchantsFromJeeSite();
      if (!disposed) {
        ElMessage.success(
          `已同步 ${result.packagesPersisted} 条套餐` +
            (result.upserted ? `，${result.upserted} 家商家` : '') +
            (result.stalePackagesDeactivated
              ? `，已清理 ${result.stalePackagesDeactivated} 个过期在售 SKU`
              : '')
        );
      }
    } catch (cause) {
      if (disposed) return;
      ElMessage.warning(
        `JeeSite 同步失败：${cause instanceof Error ? cause.message : '未知错误'}；将重新加载本地数据`
      );
    } finally {
      try {
        if (!disposed) await reload();
      } finally {
        syncing.value = false;
      }
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
          saleStatus: saleStatus.value !== 'all' ? saleStatus.value : undefined,
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
        inventoryStatus: inventoryStatus.value !== 'all' ? inventoryStatus.value : undefined,
        saleStatus: saleStatus.value !== 'all' ? saleStatus.value : undefined
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
        saleStatus: saleStatus.value !== 'all' ? saleStatus.value : undefined,
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
    saleStatus,
    page,
    loading,
    detailLoading,
    syncing,
    error,
    detailError,
    items,
    selectedPackageId,
    selectedProduct,
    detail,
    summary,
    pagination,
    reload,
    syncAndReload,
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
