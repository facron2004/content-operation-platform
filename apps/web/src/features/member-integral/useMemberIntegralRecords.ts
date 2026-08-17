import { onMounted, ref } from 'vue';
import {
  getMemberIntegralRecords,
  type MemberIntegralRecord,
  type MemberIntegralRecordPage
} from '../../services/api/member-integral.api';
import { extractErrorMessage } from '../../services/http-client';

const DEFAULT_PAGE_SIZE = 20;

export function useMemberIntegralRecords() {
  const page = ref(1);
  const pageSize = ref(DEFAULT_PAGE_SIZE);
  const total = ref(0);
  const list = ref<MemberIntegralRecord[]>([]);
  const dataSource = ref<MemberIntegralRecordPage['dataSource']>('JeeSite');
  const loading = ref(false);
  const error = ref('');
  let requestId = 0;

  async function reload() {
    const currentRequestId = ++requestId;
    loading.value = true;
    error.value = '';
    try {
      const response = await getMemberIntegralRecords({
        page: page.value,
        pageSize: pageSize.value
      });
      if (currentRequestId !== requestId) return;
      list.value = response.list;
      total.value = response.total;
      page.value = response.page;
      pageSize.value = response.pageSize;
      dataSource.value = response.dataSource;
    } catch (cause) {
      if (currentRequestId === requestId) {
        error.value = extractErrorMessage(cause, '积分记录加载失败');
      }
    } finally {
      if (currentRequestId === requestId) loading.value = false;
    }
  }

  function setPage(nextPage: number) {
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
    setPage
  };
}
