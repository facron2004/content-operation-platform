import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../../services/api';
import { resolveSubmissionIntent, type SubmissionIntent } from '../../../services/idempotency-key';

export type CommunityImportSource = 'csv' | 'json';

export interface CommunityImportPayload {
  source: CommunityImportSource;
  rawData: string;
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useCommunityImport(options: { onImported?: () => void } = {}) {
  const dialogVisible = ref(false);
  const importing = ref(false);
  const importSource = ref<CommunityImportSource>('csv');
  const rawData = ref('');
  let submissionIntent: SubmissionIntent | null = null;

  function open(): void {
    submissionIntent = null;
    importSource.value = 'csv';
    rawData.value = '';
    dialogVisible.value = true;
  }

  function close(): void {
    submissionIntent = null;
    dialogVisible.value = false;
  }

  function validate(): boolean {
    if (!importSource.value) {
      ElMessage.warning('请选择导入格式（CSV 或 JSON）');
      return false;
    }
    if (!rawData.value.trim()) {
      ElMessage.warning('请粘贴需要导入的 CSV 或 JSON 内容');
      return false;
    }
    return true;
  }

  async function submit(): Promise<boolean> {
    if (importing.value) return false;
    if (!validate()) return false;
    importing.value = true;
    try {
      const payload = {
        source: importSource.value,
        rawData: rawData.value.trim()
      };
      submissionIntent = resolveSubmissionIntent('batch-import', payload, submissionIntent);
      await api.importCommunities(payload, submissionIntent.key);
      ElMessage.success('社群导入成功');
      close();
      options.onImported?.();
      return true;
    } catch (error) {
      ElMessage.error(resolveErrorMessage(error, '社群导入失败，请检查数据格式'));
      return false;
    } finally {
      importing.value = false;
    }
  }

  return { dialogVisible, importing, importSource, rawData, open, close, submit };
}
