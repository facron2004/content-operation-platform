import { ref, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../services/api';

async function fetchCookieStatus() {
  try {
    return await api.getCookieStatus();
  } catch {
    return null;
  }
}

async function saveCookieString(cookie: string): Promise<boolean> {
  try {
    const res = await api.updateCookie(cookie);
    if (res.success) {
      ElMessage.success('Cookie 更新成功，连接已恢复！');
      return true;
    }
    ElMessage.error(res.error || '更新失败，请检查 Cookie 是否有效');
    return false;
  } catch {
    return false;
  }
}

function startCookieStatusPoller(
  refreshStatus: () => Promise<void>,
  intervalMs = 30000
): () => void {
  const cookiePoller = setInterval(refreshStatus, intervalMs);
  return () => clearInterval(cookiePoller);
}

type CookieStatus = Awaited<ReturnType<typeof fetchCookieStatus>>;

export function useCookieConfigDialog(emit: (e: 'update:visible', value: boolean) => void) {
  const cookieStatus = ref<CookieStatus | null>(null),
    updatingCookie = ref(false),
    newCookieString = ref('');
  const refreshStatus = async () => {
    cookieStatus.value = await fetchCookieStatus();
  };
  const onOpen = async () => {
    newCookieString.value = '';
    await refreshStatus();
  };
  const saveCookie = async () => {
    if (!newCookieString.value.trim()) {
      ElMessage.warning('请输入 Cookie 字符串');
      return;
    }
    updatingCookie.value = true;
    try {
      if (await saveCookieString(newCookieString.value.trim())) {
        emit('update:visible', false);
        await refreshStatus();
      }
    } finally {
      updatingCookie.value = false;
    }
  };
  onUnmounted(startCookieStatusPoller(refreshStatus));
  return {
    cookieStatus,
    updatingCookie,
    newCookieString,
    onOpen,
    saveCookie,
    formatTime: (timeStr: string) => (timeStr ? new Date(timeStr).toLocaleString() : '')
  };
}
