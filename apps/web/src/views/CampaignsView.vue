<template>
  <section class="page-stack campaigns-page">
    <div class="page-header">
      <h2>
        运营活动
        <span v-if="windowLabel">（{{ windowLabel }}）</span>
      </h2>
      <AppleButton variant="primary" @click="form.open()">
        <template #icon>
          <el-icon><Plus /></el-icon>
        </template>
        新建活动
      </AppleButton>
    </div>
    <CampaignFilterBar v-model="filters" @search="handleSearch" />
    <!-- Residual #276: one-sided startDate filter expands to 90d; surface effective window. -->
    <p v-if="windowLabel" class="list-window-hint">
      开始日筛选已按交互查询上限收束为 {{ windowLabel }}；超出该区间的活动不会出现在本列表。
    </p>
    <!-- Residual #207: list status CTAs (start/pause/complete/cancel). -->
    <CampaignListTable
      :loading="loading"
      :campaigns="campaigns"
      :pagination="pagination"
      @view="handleView"
      @edit="handleEdit"
      @delete="handleDelete"
      @start="handleStart"
      @pause="handlePause"
      @complete="handleComplete"
      @cancel="handleCancel"
      @update:page="setPage"
      @update:page-size="setPageSize"
    />
    <CampaignCreateDialog
      v-model="form.dialogVisible"
      :submitting="submitting"
      :is-edit="isEdit"
      :form="form.form"
      @submit="form.submit"
    />
  </section>
</template>

<script setup lang="ts">
import { Plus } from '@element-plus/icons-vue';
import { useCampaigns } from '../features/campaigns/composables/useCampaigns';
import { useCampaignForm } from '../features/campaigns/composables/useCampaignForm';
import CampaignListTable from '../features/campaigns/components/CampaignListTable.vue';
import CampaignCreateDialog from '../features/campaigns/components/CampaignCreateDialog.vue';
import CampaignFilterBar from '../features/campaigns/components/CampaignFilterBar.vue';
import AppleButton from '../components/AppleButton.vue';
import type { MarketingCampaign } from '@content/shared';

const {
  loading,
  campaigns,
  pagination,
  filters,
  setPage,
  setPageSize,
  refresh,
  handleDelete,
  handleStart,
  handlePause,
  handleComplete,
  handleCancel,
  // Residual #276
  windowLabel
} = useCampaigns();

// Residual #190: refresh list after create/edit so table is not stale.
const form = useCampaignForm(undefined, { onSuccess: () => refresh() });
const { submitting, isEdit } = form;

function handleSearch() {
  refresh();
}

function handleView(_campaign: MarketingCampaign) {
  // Router navigation handled via router-link in the table
}

function handleEdit(campaign: MarketingCampaign) {
  form.open(campaign);
}
</script>

<style scoped>
.campaigns-page {
  padding: 0;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

/* Residual #276: INTERACTIVE startDate window honesty. */
.list-window-hint {
  margin: 0 0 12px;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #b45309;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
}
</style>
