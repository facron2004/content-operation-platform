<template>
  <section class="page-stack campaign-detail-page">
    <div class="back-link">
      <el-button text :icon="ArrowLeft" @click="$router.push('/campaigns')">返回活动列表</el-button>
    </div>
    <CampaignDetailHero
      :campaign="campaign"
      :loading="loading"
      @start="startCampaign"
      @pause="pauseCampaign"
      @complete="completeCampaign"
      @cancel="cancelCampaign"
    />
    <CampaignTaskSummary :kpis="kpis" :loading="loading" />
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft } from '@element-plus/icons-vue';
import { useCampaignDetail } from '../features/campaigns/composables/useCampaignDetail';
import CampaignDetailHero from '../features/campaigns/components/CampaignDetailHero.vue';
import CampaignTaskSummary from '../features/campaigns/components/CampaignTaskSummary.vue';

const route = useRoute();
const router = useRouter();
const campaignId = route.params.campaignId as string;

const {
  loading,
  campaign,
  kpis,
  loadDetail,
  startCampaign,
  pauseCampaign,
  completeCampaign,
  cancelCampaign
} = useCampaignDetail(campaignId);

onMounted(loadDetail);
</script>

<style scoped>
.campaign-detail-page {
  padding: 20px;
}

.back-link {
  margin-bottom: 16px;
}
</style>
