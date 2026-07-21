import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { MarketingCampaign, TaskKpiResponse } from '@content/shared';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';

export function useCampaignDetail(campaignId: string) {
  const loading = ref(false);
  const actionLoading = ref(false);
  const campaign = ref<MarketingCampaign | null>(null);
  const kpis = ref<TaskKpiResponse | null>(null);

  async function loadDetail(): Promise<void> {
    if (loading.value) return;
    loading.value = true;
    try {
      const [campaignData, kpiData] = await Promise.all([
        api.getCampaign(campaignId),
        api.getTaskKPIs()
      ]);
      campaign.value = campaignData as MarketingCampaign;
      kpis.value = kpiData;
    } catch (error) {
      ElMessage.error(extractErrorMessage(error, '加载活动详情失败'));
    } finally {
      loading.value = false;
    }
  }

  async function runAction(
    action: () => Promise<unknown>,
    successText: string,
    failText: string
  ): Promise<void> {
    if (actionLoading.value) return;
    actionLoading.value = true;
    try {
      await action();
      ElMessage.success(successText);
      await loadDetail();
    } catch (error) {
      ElMessage.error(extractErrorMessage(error, failText));
    } finally {
      actionLoading.value = false;
    }
  }

  async function startCampaign(): Promise<void> {
    await runAction(() => api.startCampaign(campaignId), '活动已启动', '启动活动失败');
  }

  async function pauseCampaign(): Promise<void> {
    await runAction(() => api.pauseCampaign(campaignId), '活动已暂停', '暂停活动失败');
  }

  async function completeCampaign(): Promise<void> {
    await runAction(() => api.completeCampaign(campaignId), '活动已结束', '结束活动失败');
  }

  async function cancelCampaign(): Promise<void> {
    try {
      await ElMessageBox.confirm(
        `确认取消活动「${campaign.value?.name ?? ''}」？取消后不可恢复。`,
        '取消确认',
        { type: 'warning', confirmButtonText: '取消活动', cancelButtonText: '再想想' }
      );
    } catch {
      return;
    }
    await runAction(() => api.cancelCampaign(campaignId), '活动已取消', '取消活动失败');
  }

  onMounted(loadDetail);

  return {
    loading,
    actionLoading,
    campaign,
    kpis,
    loadDetail,
    startCampaign,
    pauseCampaign,
    completeCampaign,
    cancelCampaign
  };
}
