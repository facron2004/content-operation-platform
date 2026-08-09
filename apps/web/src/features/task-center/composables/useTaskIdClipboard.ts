import { onScopeDispose, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { copyTextToClipboard } from '../../../utils/clipboard';

export function useTaskIdClipboard() {
  const copyError = ref<string | null>(null);
  let disposed = false;
  let requestId = 0;

  onScopeDispose(() => {
    disposed = true;
    requestId += 1;
  }, true);

  async function copyTaskId(id: string): Promise<void> {
    if (disposed) return;
    const currentRequestId = ++requestId;
    copyError.value = null;
    const copied = await copyTextToClipboard(id);
    if (disposed || currentRequestId !== requestId) return;
    if (copied) {
      ElMessage.success('任务 ID 已复制');
    } else {
      copyError.value = '复制任务 ID 失败，请手动复制';
      ElMessage.error('复制任务 ID 失败，请手动复制');
    }
  }

  return { copyError, copyTaskId };
}
