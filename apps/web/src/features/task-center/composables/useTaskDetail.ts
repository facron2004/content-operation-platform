import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { DistributionExecution, TaskDetailResponse, TaskKpiResponse } from '@content/shared';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';

export function useTaskDetail(taskId: string) {
  const loading = ref(false);
  const task = ref<TaskDetailResponse | null>(null);
  const executions = ref<DistributionExecution[]>([]);
  const kpis = ref<TaskKpiResponse | null>(null);

  async function loadDetail() {
    loading.value = true;
    try {
      const [detail, kpiRes] = await Promise.all([api.getTask(taskId), api.getTaskKPIs()]);
      task.value = detail;
      executions.value = detail.executions ?? [];
      kpis.value = kpiRes;
    } catch (err) {
      ElMessage.error(extractErrorMessage(err, '加载任务详情失败'));
    } finally {
      loading.value = false;
    }
  }

  async function publish(data: { evidenceUrl?: string; note?: string }) {
    try {
      await api.publishTask(taskId, data);
      ElMessage.success('任务已发布');
      await loadDetail();
    } catch (err) {
      ElMessage.error(extractErrorMessage(err, '发布任务失败'));
    }
  }

  async function fail(data: { failReason: string; failCategory?: string; note?: string }) {
    try {
      await api.failTask(taskId, data);
      ElMessage.success('任务已标记为失败');
      await loadDetail();
    } catch (err) {
      ElMessage.error(extractErrorMessage(err, '标记失败失败'));
    }
  }

  async function cancel(data: { cancelReason: string; note?: string }) {
    try {
      await api.cancelTask(taskId, data);
      ElMessage.success('任务已取消');
      await loadDetail();
    } catch (err) {
      ElMessage.error(extractErrorMessage(err, '取消任务失败'));
    }
  }

  async function reassign(data: { assigneeId: string; note?: string }) {
    try {
      await api.reassignTask(taskId, data);
      ElMessage.success('任务已重新分配');
      await loadDetail();
    } catch (err) {
      ElMessage.error(extractErrorMessage(err, '重新分配失败'));
    }
  }

  onMounted(() => {
    void loadDetail();
  });

  return {
    loading,
    task,
    executions,
    kpis,
    loadDetail,
    publish,
    fail,
    cancel,
    reassign,
    publishTask: publish,
    failTask: fail,
    cancelTask: cancel,
    reassignTask: reassign
  };
}
