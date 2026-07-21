<template>
  <section class="page-stack campaigns-page">
    <div class="page-header">
      <h2>运营活动</h2>
      <el-button type="primary" :icon="Plus" @click="form.open()">新建活动</el-button>
    </div>
    <CampaignFilterBar v-model="filters" @search="handleSearch" />
    <CampaignListTable
      :loading="loading"
      :campaigns="campaigns"
      :pagination="pagination"
      @view="handleView"
      @edit="handleEdit"
      @delete="handleDelete"
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
  updateFilter
} = useCampaigns();

const form = useCampaignForm();
const { submitting, isEdit } = form;

function handleSearch() {
  refresh();
}

function handleView(campaign: MarketingCampaign) {
  // Router navigation handled via router-link in the table
}

function handleEdit(campaign: MarketingCampaign) {
  form.open(campaign);
}
</script>

<style scoped>
.campaigns-page {
  padding: 20px;
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
</style>
