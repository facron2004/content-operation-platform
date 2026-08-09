import { onScopeDispose, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../services/api';
import { extractErrorMessage } from '../services/http-client';

type CookieStatus = Awaited<ReturnType<typeof api.getCookieStatus>>;

export function useCookieConfigDialog(emit: (e: 'update:visible', value: boolean) => void) {
  const cookieStatus = ref<CookieStatus | null>(null),
    statusError = ref<string | null>(null),
    saveError = ref<string | null>(null),
    updatingCookie = ref(false),
    newCookieString = ref('');
  let disposed = false;
  let statusRequestId = 0;
  let saveRequestId = 0;
  const isCurrentSave = (requestId: number) => !disposed && requestId === saveRequestId;

  onScopeDispose(() => {
    disposed = true;
    statusRequestId += 1;
    saveRequestId += 1;
    updatingCookie.value = false;
  });

  const refreshStatus = async () => {
    if (disposed) return;
    const requestId = ++statusRequestId;
    statusError.value = null;
    try {
      const nextStatus = await api.getCookieStatus();
      if (!disposed && requestId === statusRequestId) cookieStatus.value = nextStatus;
    } catch (error) {
      if (!disposed && requestId === statusRequestId) {
        statusError.value = extractErrorMessage(error, '读取数据源连接状态失败，请稍后重试');
      }
    }
  };
  const onOpen = async () => {
    if (disposed) return;
    newCookieString.value = '';
    saveError.value = null;
    await refreshStatus();
  };
  const saveCookie = async () => {
    if (disposed || updatingCookie.value) return;
    const cookie = newCookieString.value.trim();
    if (!cookie) {
      ElMessage.warning('请输入 Cookie 字符串');
      return;
    }
    const requestId = ++saveRequestId;
    statusRequestId += 1;
    saveError.value = null;
    updatingCookie.value = true;
    try {
      const res = await api.updateCookie(cookie);
      if (!isCurrentSave(requestId)) return;
      if (!res?.success) {
        saveError.value = res?.error || '更新失败，请稍后重试';
        return;
      }
      ElMessage.success('Cookie 更新成功，连接已恢复！');
      emit('update:visible', false);
      await refreshStatus();
    } catch (error) {
      if (isCurrentSave(requestId)) {
        saveError.value = extractErrorMessage(error, '更新失败，请稍后重试');
      }
    } finally {
      if (isCurrentSave(requestId)) updatingCookie.value = false;
    }
  };
  return {
    cookieStatus,
    statusError,
    saveError,
    updatingCookie,
    newCookieString,
    onOpen,
    saveCookie,
    formatTime: (timeStr: string) => (timeStr ? new Date(timeStr).toLocaleString() : '')
  };
}
