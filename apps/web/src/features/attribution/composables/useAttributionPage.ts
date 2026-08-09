import { computed, onMounted, onScopeDispose, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useRoleStore } from '../../../stores/role';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';
import { EMPTY_UNMATCHED_ORDERS, mapUnmatchedOrdersResponse } from './attribution-core';
import type { UnmatchedOrder } from '../../../services/api/attribution.api';

export function useAttributionPage() {
  const roleStore = useRoleStore();
  const loading = ref(false);
  const actionLoading = ref(false);
  const loadError = ref<string | null>(null);
  const actionError = ref<string | null>(null);
  const orders = ref<UnmatchedOrder[]>([]);
  const dateFrom = ref(EMPTY_UNMATCHED_ORDERS.dateFrom);
  const dateTo = ref(EMPTY_UNMATCHED_ORDERS.dateTo);
  const pagination = reactive({
    page: EMPTY_UNMATCHED_ORDERS.page,
    pageSize: EMPTY_UNMATCHED_ORDERS.pageSize,
    total: EMPTY_UNMATCHED_ORDERS.total
  });
  const bindDialogVisible = ref(false);
  const bindOrder = ref<UnmatchedOrder | null>(null);
  const bindTaskId = ref('');
  const requestId = ref(0);
  let disposed = false;
  let actionRequestId = 0;
  const canManage = computed(() => roleStore.permissions.includes('attribution:manage'));

  async function load() {
    if (disposed) return;
    const currentRequestId = ++requestId.value;
    loading.value = true;
    loadError.value = null;
    try {
      const result = mapUnmatchedOrdersResponse(
        await api.getUnmatchedOrders({
          page: pagination.page,
          pageSize: pagination.pageSize
        })
      );
      if (disposed || currentRequestId !== requestId.value) return;
      orders.value = result.items;
      pagination.page = result.page;
      pagination.pageSize = result.pageSize;
      pagination.total = result.total;
      dateFrom.value = result.dateFrom;
      dateTo.value = result.dateTo;
    } catch (error) {
      if (!disposed && currentRequestId === requestId.value) {
        loadError.value = extractErrorMessage(error, '未匹配订单加载失败，请稍后重试');
      }
    } finally {
      if (!disposed && currentRequestId === requestId.value) loading.value = false;
    }
  }

  function handlePageChange(page: number) {
    if (disposed) return;
    pagination.page = page;
    void load();
  }

  function handleSizeChange(pageSize: number) {
    if (disposed) return;
    pagination.page = 1;
    pagination.pageSize = pageSize;
    void load();
  }

  function openBind(order: UnmatchedOrder) {
    if (!canManage.value) return;
    actionError.value = null;
    bindOrder.value = order;
    bindTaskId.value = '';
    bindDialogVisible.value = true;
  }

  function closeBind() {
    bindDialogVisible.value = false;
    bindOrder.value = null;
    bindTaskId.value = '';
  }

  function setBindDialogVisible(value: boolean) {
    if (value) {
      bindDialogVisible.value = true;
      return;
    }
    closeBind();
  }

  function setBindTaskId(value: string) {
    bindTaskId.value = value;
  }

  async function manualBind() {
    if (disposed || actionLoading.value) return;
    const order = bindOrder.value;
    const taskId = bindTaskId.value.trim();
    if (!order || !taskId) {
      ElMessage.warning('请输入要绑定的任务 ID');
      return;
    }
    actionError.value = null;
    const currentActionRequestId = ++actionRequestId;
    actionLoading.value = true;
    try {
      await api.manualBindAttribution({ taskId, orderId: order.orderId });
      if (disposed || currentActionRequestId !== actionRequestId) return;
      ElMessage.success('已完成手工归因');
      closeBind();
      await load();
    } catch (error) {
      if (!disposed && currentActionRequestId === actionRequestId) {
        actionError.value = extractErrorMessage(error, '手工归因失败，请检查任务与订单是否匹配');
        ElMessage.error(actionError.value);
      }
    } finally {
      if (!disposed && currentActionRequestId === actionRequestId) actionLoading.value = false;
    }
  }

  async function recompute() {
    if (disposed || !canManage.value || actionLoading.value) return;
    try {
      await ElMessageBox.confirm(
        '归因重算会扫描当前有效任务和订单，可能占用一段时间。确定继续吗？',
        '确认重算归因',
        { type: 'warning', confirmButtonText: '开始重算', cancelButtonText: '取消' }
      );
    } catch {
      return;
    }
    if (disposed) return;
    actionError.value = null;
    const currentActionRequestId = ++actionRequestId;
    actionLoading.value = true;
    try {
      const result = await api.recomputeAttribution();
      if (disposed || currentActionRequestId !== actionRequestId) return;
      ElMessage.success(`归因重算完成，处理 ${result.processedTasks} 个任务`);
      await load();
    } catch (error) {
      if (!disposed && currentActionRequestId === actionRequestId) {
        actionError.value = extractErrorMessage(error, '归因重算失败，请稍后重试');
        ElMessage.error(actionError.value);
      }
    } finally {
      if (!disposed && currentActionRequestId === actionRequestId) actionLoading.value = false;
    }
  }

  onScopeDispose(() => {
    disposed = true;
    requestId.value += 1;
    actionRequestId += 1;
    loading.value = false;
    actionLoading.value = false;
  });

  onMounted(() => void load());

  return {
    loading,
    actionLoading,
    loadError,
    actionError,
    orders,
    dateFrom,
    dateTo,
    pagination,
    canManage,
    bindDialogVisible,
    bindOrder,
    bindTaskId,
    load,
    handlePageChange,
    handleSizeChange,
    openBind,
    closeBind,
    setBindDialogVisible,
    setBindTaskId,
    manualBind,
    recompute
  };
}
