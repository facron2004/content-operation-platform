<template>
  <section class="page-stack campaign-detail-page">
    <div class="back-link">
      <AppleButton variant="ghost" @click="$router.push('/campaigns')">
        <template #icon>
          <el-icon><ArrowLeft /></el-icon>
        </template>
        返回活动列表
      </AppleButton>
    </div>
    <CampaignDetailHero
      :campaign="campaign"
      :loading="loading"
      @start="startCampaign"
      @pause="pauseCampaign"
      @complete="completeCampaign"
      @cancel="cancelCampaign"
    />
    <CampaignTaskSummary :performance="performance" :loading="loading" />
    <!-- Residual #187/#239: nested campaign tasks with pagination. -->
    <CampaignTaskList
      :tasks="tasks"
      :tasks-total="tasksTotal"
      :tasks-page="tasksPage"
      :tasks-page-size="tasksPageSize"
      :tasks-loading="tasksLoading"
      :tasks-window-label="tasksWindowLabel"
      :loading="loading"
      :campaign-id="campaignId"
      @update:tasks-page="setTasksPage"
    />
  </section>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import { ArrowLeft } from '@element-plus/icons-vue';
import { useCampaignDetail } from '../features/campaigns/composables/useCampaignDetail';
import CampaignDetailHero from '../features/campaigns/components/CampaignDetailHero.vue';
import CampaignTaskSummary from '../features/campaigns/components/CampaignTaskSummary.vue';
import CampaignTaskList from '../features/campaigns/components/CampaignTaskList.vue';
import AppleButton from '../components/AppleButton.vue';

const route = useRoute();
const campaignId = route.params.campaignId as string;

// Residual #178: performance is campaign-scoped. Composable owns the mount fetch;
// do not re-bind a second mount hook that double-fetched detail + KPIs.
// Residual #187/#239: also loads paginated campaign tasks.
const {
  loading,
  campaign,
  performance,
  tasks,
  tasksTotal,
  tasksPage,
  tasksPageSize,
  tasksLoading,
  // Residual #271
  tasksWindowLabel,
  setTasksPage,
  startCampaign,
  pauseCampaign,
  completeCampaign,
  cancelCampaign
} = useCampaignDetail(campaignId);
</script>

<style scoped>
.campaign-detail-page {
  padding: 0;
}

.back-link {
  margin-bottom: 16px;
}
</style>
