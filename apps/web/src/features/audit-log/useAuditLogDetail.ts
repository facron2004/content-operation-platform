import { onScopeDispose, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../services/api';
import { extractErrorMessage } from '../../services/http-client';

export type AuditLogRow = {
  logId?: string;
  username?: string;
  userId?: string;
  action?: string;
  objectType?: string;
  objectId?: string;
  ip?: string;
  createdAt?: string;
  result?: string;
  failReason?: string;
  before?: string;
  after?: string;
};

export function useAuditLogDetail() {
  const detailVisible = ref(false);
  const detailLoading = ref(false);
  const detailError = ref<string | null>(null);
  const selectedLog = ref<AuditLogRow | null>(null);
  let disposed = false;
  let requestId = 0;

  const isCurrent = (id: number) => !disposed && id === requestId && detailVisible.value;

  async function showDetail(row: AuditLogRow): Promise<void> {
    if (disposed) return;
    const id = ++requestId;
    selectedLog.value = row;
    detailVisible.value = true;
    detailLoading.value = false;
    detailError.value = null;
    if (!row.logId) return;

    detailLoading.value = true;
    try {
      const full = (await api.getAuditLog(row.logId)) as AuditLogRow | null;
      if (isCurrent(id) && full) selectedLog.value = full;
    } catch (err) {
      if (isCurrent(id)) {
        const message = extractErrorMessage(err, '加载审计详情失败');
        detailError.value = message;
        ElMessage.warning(message);
      }
    } finally {
      if (!disposed && id === requestId) detailLoading.value = false;
    }
  }

  function onDetailClosed(): void {
    requestId += 1;
    detailVisible.value = false;
    selectedLog.value = null;
    detailLoading.value = false;
    detailError.value = null;
  }

  onScopeDispose(() => {
    disposed = true;
    requestId += 1;
    detailVisible.value = false;
    selectedLog.value = null;
    detailLoading.value = false;
    detailError.value = null;
  }, true);

  return {
    detailVisible,
    detailLoading,
    detailError,
    selectedLog,
    showDetail,
    onDetailClosed
  };
}
