import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { MarketingCampaign } from '@content/shared';
import { api } from '../../../services/api';
import { extractErrorMessage } from '../../../services/http-client';
import { confirmAndDelete } from '../../../composables/useConfirmDelete';

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

function createDefaultFilters(): CampaignFilters {
  return { status: '', campaignType: '', keyword: '' };
}

export function useCampaigns() {
  const loading = ref(false);
  const campaigns = ref<MarketingCampaign[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(20);
  const filters = ref<CampaignFilters>(createDefaultFilters());

  const pagination = computed(() => ({
    current: page.value,
    pageSize: pageSize.value,
    total: total.value
  }));

  async function loadCampaigns(): Promise<void> {
    loading.value = true;
    try {
      const params: Record<string, unknown> = { page: page.value, pageSize: pageSize.value };
      if (filters.value.status) params.status = filters.value.status;
      if (filters.value.campaignType) params.campaignType = filters.value.campaignType;
      const keyword = filters.value.keyword.trim();
      if (keyword) params.keyword = keyword;
      const data = await api.listCampaigns(params);
      campaigns.value = data.items ?? [];
      total.value = data.total ?? 0;
    } catch (error) {
      campaigns.value = [];
      total.value = 0;
      ElMessage.error(extractErrorMessage(error, '加载活动列表失败'));
    } finally {
      loading.value = false;
    }
  }

  function setPage(nextPage: number): void {
    page.value = nextPage;
    loadCampaigns();
  }

  function setPageSize(nextPageSize: number): void {
    pageSize.value = nextPageSize;
    page.value = 1;
    loadCampaigns();
  }

  function refresh(): void {
    page.value = 1;
    loadCampaigns();
  }

  function updateFilter(patch: Partial<CampaignFilters>): void {
    filters.value = { ...filters.value, ...patch };
    page.value = 1;
    loadCampaigns();
  }

  async function reloadCurrentPage(): Promise<void> {
    await loadCampaigns();
    if (!campaigns.value.length && page.value > 1) {
      page.value -= 1;
      await loadCampaigns();
    }
  }

  async function handleDelete(campaign: MarketingCampaign): Promise<void> {
    await confirmAndDelete(
      { message: `确认删除活动「${campaign.name}」？此操作不可恢复。` },
      () => api.deleteCampaign(campaign.campaignId),
      { successMsg: '活动已删除', errorMsg: '删除活动失败', onSuccess: reloadCurrentPage }
    );
  }

  onMounted(loadCampaigns);

  return {
    loading,
    campaigns,
    total,
    page,
    pageSize,
    filters,
    pagination,
    loadCampaigns,
    setPage,
    setPageSize,
    refresh,
    updateFilter,
    handleSearch: refresh,
    handleDelete,
    deleteCampaign: handleDelete
  };
}
