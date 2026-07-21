<template>
  <section class="campaign-list-table">
    <el-table
      v-loading="loading"
      :data="campaigns"
      stripe
      style="width: 100%"
      empty-text="暂无活动数据"
    >
      <el-table-column label="活动名称" min-width="200" fixed="left">
        <template #default="{ row }">
          <router-link
            class="campaign-name-link"
            :to="`/campaigns/${row.campaignId}`"
            @click="emit('view', row)"
          >
            {{ row.name }}
          </router-link>
          <p v-if="row.description" class="campaign-desc">{{ row.description }}</p>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="120">
        <template #default="{ row }">
          <el-tag :type="typeTagType(row.campaignType)" effect="plain" size="small">
            {{ typeLabel(row.campaignType) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <CampaignStatusTag :status="row.status" size="small" />
        </template>
      </el-table-column>
      <el-table-column label="时间范围" min-width="200">
        <template #default="{ row }">
          {{ formatDate(row.startDate) }} ~ {{ formatDate(row.endDate) }}
        </template>
      </el-table-column>
      <el-table-column label="预算" width="120" align="right">
        <template #default="{ row }">{{ formatGmv(row.budget) }}</template>
      </el-table-column>
      <el-table-column label="目标GMV" width="120" align="right">
        <template #default="{ row }">{{ formatGmv(row.targetGmv) }}</template>
      </el-table-column>
      <el-table-column label="目标订单" width="100" align="right">
        <template #default="{ row }">{{ formatCount(row.targetOrders) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button text type="primary" size="small" :icon="Edit" @click="emit('edit', row)">
            编辑
          </el-button>
          <el-button text type="danger" size="small" :icon="Delete" @click="emit('delete', row)">
            删除
          </el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="暂无活动数据" :image-size="80" />
      </template>
    </el-table>
    <div class="table-footer">
      <el-pagination
        :current-page="pagination.current"
        :page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="(page: number) => emit('update:page', page)"
        @size-change="(size: number) => emit('update:pageSize', size)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { Delete, Edit } from '@element-plus/icons-vue';
import type { MarketingCampaign } from '@content/shared';
import { CAMPAIGN_TYPE_LABELS } from '../composables/useCampaigns';
import CampaignStatusTag from './CampaignStatusTag.vue';
import { formatCount, formatGmv } from '../../../utils/format';

type TagType = 'primary' | 'success' | 'info' | 'warning' | 'danger';

withDefaults(
  defineProps<{
    campaigns: MarketingCampaign[];
    loading?: boolean;
    pagination: { current: number; pageSize: number; total: number };
  }>(),
  { loading: false }
);

const emit = defineEmits<{
  view: [campaign: MarketingCampaign];
  edit: [campaign: MarketingCampaign];
  delete: [campaign: MarketingCampaign];
  'update:page': [page: number];
  'update:pageSize': [pageSize: number];
}>();

const TYPE_TAG_TYPES: Record<MarketingCampaign['campaignType'], TagType> = {
  daily: 'primary',
  zero_sales_wakeup: 'warning',
  flash: 'danger',
  new_product: 'success',
  verify_reminder: 'info',
  merchant_join: 'primary'
};

function typeLabel(type: MarketingCampaign['campaignType']): string {
  return CAMPAIGN_TYPE_LABELS[type] ?? type;
}

function typeTagType(type: MarketingCampaign['campaignType']): TagType {
  return TYPE_TAG_TYPES[type] ?? 'info';
}

function formatDate(value?: string): string {
  return value ? value.slice(0, 10) : '—';
}
</script>

<style scoped>
.campaign-list-table {
  width: 100%;
}

.campaign-name-link {
  color: var(--el-color-primary);
  text-decoration: none;
  font-weight: 500;
}

.campaign-name-link:hover {
  text-decoration: underline;
}

.campaign-desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
}

.table-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
