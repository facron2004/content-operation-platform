import { onMounted, ref } from 'vue';
import {
  getWelfarePointsList,
  type WelfarePointListResult,
  type WelfarePointRecord
} from '../../../services/api/welfare-points.api';
import { extractErrorMessage } from '../../../services/http-client';

const DEFAULT_PAGE_SIZE = 20;

/**
 * Welfare records are append-only. The page is therefore the unit of work:
 * read the selected JeeSite page, persist those rows idempotently, and use the
 * local page only when the external read fails.
 */
export function useWelfarePoints() {
  const page = ref(1);
  const pageSize = ref(DEFAULT_PAGE_SIZE);
  const total = ref(0);
  const list = ref<WelfarePointRecord[]>([]);
  const dataSource = ref<WelfarePointListResult['dataSource']>('JeeSite');
  const loading = ref(false);
  const error = ref('');
  let requestId = 0;

  async function reload() {
    const currentRequestId = ++requestId;
    loading.value = true;
    error.value = '';
    try {
      // Bypass the browser cache because the upstream page is the primary
      // source and new records can arrive between two visits.
      const response = await getWelfarePointsList(
        { page: page.value, pageSize: pageSize.value },
        true
      );
      if (currentRequestId !== requestId) return;
      list.value = response.list;
      total.value = response.total;
      page.value = response.page;
      pageSize.value = response.pageSize;
      dataSource.value = response.dataSource;
    } catch (cause) {
      if (currentRequestId === requestId) {
        error.value = extractErrorMessage(cause, '福利金记录加载失败');
      }
    } finally {
      if (currentRequestId === requestId) loading.value = false;
    }
  }

  function changePage(nextPage: number) {
    if (nextPage < 1 || nextPage === page.value) return;
    page.value = nextPage;
    void reload();
  }

  onMounted(() => void reload());

  return {
    page,
    pageSize,
    total,
    list,
    dataSource,
    loading,
    error,
    reload,
    changePage
  };
}
