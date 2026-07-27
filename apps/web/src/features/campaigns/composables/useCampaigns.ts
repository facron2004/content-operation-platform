import { computed, onMounted, ref, type ComputedRef, type Ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { MarketingCampaign } from '@content/shared';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';
import { confirmAndDelete } from '../../../composables/useConfirmDelete';
import { usePagedList, type PagedListReturn } from '../../../composables/usePagedList';

export interface CampaignFilters {
  status: string;
  campaignType: string;
  keyword: string;
  // Residual #202: startDate window (API CampaignQueryDto already supports).
  startDateFrom: string;
  startDateTo: string;
}

export const CAMPAIGN_TYPE_LABELS: Record<MarketingCampaign['campaignType'], string> = {
  daily: '日常活动',
  zero_sales_wakeup: '零动销唤醒',
  flash: '限时秒杀',
  new_product: '新品推广',
  verify_reminder: '核销提醒',
  merchant_join: '商家入驻'
};

export const CAMPAIGN_STATUS_LABELS: Record<MarketingCampaign['status'], string> = {
  draft: '草稿',
  active: '进行中',
  paused: '已暂停',
  completed: '已结束',
  cancelled: '已取消'
};

export function useCampaigns(): PagedListReturn<MarketingCampaign, CampaignFilters> & {
  campaigns: PagedListReturn<MarketingCampaign, CampaignFilters>['items'];
  actionLoading: Ref<boolean>;
  handleDelete: (campaign: MarketingCampaign) => Promise<void>;
  // Residual #207: list-row status transitions (API clients already exist).
  handleStart: (campaign: MarketingCampaign) => Promise<void>;
  handlePause: (campaign: MarketingCampaign) => Promise<void>;
  handleComplete: (campaign: MarketingCampaign) => Promise<void>;
  handleCancel: (campaign: MarketingCampaign) => Promise<void>;
  // Residual #276: effective startDate INTERACTIVE window honesty.
  listStartDateFrom: Ref<string | undefined>;
  listStartDateTo: Ref<string | undefined>;
  windowLabel: ComputedRef<string | null>;
} {
  // Residual #276: prefer API effective startDate span over one-sided filter inputs.
  const listStartDateFrom = ref<string | undefined>();
  const listStartDateTo = ref<string | undefined>();
  const windowLabel = computed(() => {
    if (listStartDateFrom.value && listStartDateTo.value) {
      return `${listStartDateFrom.value} ~ ${listStartDateTo.value}`;
    }
    return null;
  });

  const list = usePagedList<MarketingCampaign, CampaignFilters>(
    async ({ page, pageSize, filters }) => {
      const data = await api.listCampaigns({
        status: filters.status || undefined,
        campaignType: filters.campaignType || undefined,
        keyword: filters.keyword.trim() || undefined,
        // Residual #202: honor startDate range (API SQL already branches).
        startDateFrom: filters.startDateFrom || undefined,
        startDateTo: filters.startDateTo || undefined,
        page,
        pageSize
      });
      // Residual #276: sink effective startDate window (undefined when no date filter).
      listStartDateFrom.value = data.startDateFrom;
      listStartDateTo.value = data.startDateTo;
      return { items: data.items ?? [], total: data.total ?? 0 };
    },
    {
      status: '',
      campaignType: '',
      keyword: '',
      startDateFrom: '',
      startDateTo: ''
    },
    {
      onError: (msg) => ElMessage.error(extractErrorMessage(msg, '加载活动列表失败'))
    }
  );

  const actionLoading = ref(false);

  async function handleDelete(campaign: MarketingCampaign): Promise<void> {
    await confirmAndDelete(
      { message: `确认删除活动「${campaign.name}」？此操作不可恢复。` },
      () => api.deleteCampaign(campaign.campaignId),
      { successMsg: '活动已删除', errorMsg: '删除活动失败', onSuccess: list.reloadCurrentPage }
    );
  }

  /**
   * Residual #207: list status mutators. Detail already had start/pause/complete/cancel;
   * list was edit/delete only → triage friction. Reload current page after success.
   */
  async function runTransition(
    action: () => Promise<unknown>,
    successText: string,
    failText: string
  ): Promise<void> {
    if (actionLoading.value) return;
    actionLoading.value = true;
    try {
      await action();
      ElMessage.success(successText);
      await list.reloadCurrentPage();
    } catch (error) {
      ElMessage.error(extractErrorMessage(error, failText));
    } finally {
      actionLoading.value = false;
    }
  }

  async function handleStart(campaign: MarketingCampaign): Promise<void> {
    await runTransition(() => api.startCampaign(campaign.campaignId), '活动已启动', '启动活动失败');
  }

  async function handlePause(campaign: MarketingCampaign): Promise<void> {
    await runTransition(() => api.pauseCampaign(campaign.campaignId), '活动已暂停', '暂停活动失败');
  }

  async function handleComplete(campaign: MarketingCampaign): Promise<void> {
    await runTransition(
      () => api.completeCampaign(campaign.campaignId),
      '活动已结束',
      '结束活动失败'
    );
  }

  async function handleCancel(campaign: MarketingCampaign): Promise<void> {
    try {
      await ElMessageBox.confirm(`确认取消活动「${campaign.name}」？取消后不可恢复。`, '取消确认', {
        type: 'warning',
        confirmButtonText: '取消活动',
        cancelButtonText: '再想想'
      });
    } catch {
      return;
    }
    await runTransition(
      () => api.cancelCampaign(campaign.campaignId),
      '活动已取消',
      '取消活动失败'
    );
  }

  onMounted(() => list.load());

  return {
    ...list,
    campaigns: list.items,
    actionLoading,
    handleDelete,
    handleStart,
    handlePause,
    handleComplete,
    handleCancel,
    // Residual #276
    listStartDateFrom,
    listStartDateTo,
    windowLabel
  };
}
