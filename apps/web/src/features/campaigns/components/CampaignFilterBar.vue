<template>
  <section class="campaign-filter-bar">
    <el-form inline @submit.prevent>
      <el-form-item label="关键词">
        <el-input
          :model-value="model.keyword"
          placeholder="搜索活动名称"
          clearable
          style="width: 220px"
          @update:model-value="update({ keyword: $event })"
          @keyup.enter="emit('search')"
        />
      </el-form-item>
      <el-form-item label="状态">
        <el-select
          :model-value="model.status"
          placeholder="全部状态"
          style="width: 140px"
          @update:model-value="update({ status: $event ?? '' })"
        >
          <el-option label="全部" value="" />
          <el-option
            v-for="opt in statusOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="类型">
        <el-select
          :model-value="model.campaignType"
          placeholder="全部类型"
          style="width: 160px"
          @update:model-value="update({ campaignType: $event ?? '' })"
        >
          <el-option label="全部" value="" />
          <el-option
            v-for="opt in typeOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>
      <!-- Residual #202: startDate range already on DTO + listCampaigns client. -->
      <el-form-item label="开始日">
        <el-date-picker
          :model-value="model.startDateFrom || undefined"
          type="date"
          placeholder="起始日"
          value-format="YYYY-MM-DD"
          clearable
          style="width: 150px"
          @update:model-value="update({ startDateFrom: String($event ?? '') })"
        />
      </el-form-item>
      <el-form-item label="截止日">
        <el-date-picker
          :model-value="model.startDateTo || undefined"
          type="date"
          placeholder="结束日"
          value-format="YYYY-MM-DD"
          clearable
          style="width: 150px"
          @update:model-value="update({ startDateTo: String($event ?? '') })"
        />
      </el-form-item>
      <el-form-item>
        <AppleButton variant="primary" @click="emit('search')">
          <template #icon>
            <el-icon><Search /></el-icon>
          </template>
          搜索
        </AppleButton>
      </el-form-item>
    </el-form>
  </section>
</template>

<script setup lang="ts">
import { Search } from '@element-plus/icons-vue';
import AppleButton from '../../../components/AppleButton.vue';
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPE_LABELS,
  type CampaignFilters
} from '../composables/useCampaigns';

const model = defineModel<CampaignFilters>({ required: true });
const emit = defineEmits<{ search: [] }>();

const statusOptions = Object.entries(CAMPAIGN_STATUS_LABELS).map(([value, label]) => ({
  value,
  label
}));
const typeOptions = Object.entries(CAMPAIGN_TYPE_LABELS).map(([value, label]) => ({
  value,
  label
}));

function update(patch: Partial<CampaignFilters>): void {
  model.value = { ...model.value, ...patch };
}
</script>

<style scoped>
.campaign-filter-bar {
  margin-bottom: 16px;
}
</style>
