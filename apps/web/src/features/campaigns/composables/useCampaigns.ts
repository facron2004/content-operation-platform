import { onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import type { MarketingCampaign } from '@content/shared';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';
import { confirmAndDelete } from '../../../composables/useConfirmDelete';
import { usePagedList, type PagedListReturn } from '../../../composables/usePagedList';

export interface CampaignFilters {
  status: string;
  campaignType: string;
  keyword: string;
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
  handleDelete: (campaign: MarketingCampaign) => Promise<void>;
} {
  const list = usePagedList<MarketingCampaign, CampaignFilters>(
    async ({ page, pageSize, filters, force }) => {
      const params: Record<string, unknown> = { page, pageSize };
      if (filters.status) params.status = filters.status;
      if (filters.campaignType) params.campaignType = filters.campaignType;
      const keyword = filters.keyword.trim();
      if (keyword) params.keyword = keyword;
      const data = await api.listCampaigns(params);
      return { items: data.items ?? [], total: data.total ?? 0 };
    },
    { status: '', campaignType: '', keyword: '' },
    {
      onError: (msg) => ElMessage.error(extractErrorMessage(msg, '加载活动列表失败'))
    }
  );

  async function handleDelete(campaign: MarketingCampaign): Promise<void> {
    await confirmAndDelete(
      { message: `确认删除活动「${campaign.name}」？此操作不可恢复。` },
      () => api.deleteCampaign(campaign.campaignId),
      { successMsg: '活动已删除', errorMsg: '删除活动失败', onSuccess: list.reloadCurrentPage }
    );
  }

  onMounted(() => list.load());

  return { ...list, handleDelete };
}
