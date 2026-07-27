<template>
  <el-card v-loading="loading" class="campaign-hero">
    <template v-if="campaign">
      <div class="hero-header">
        <div class="hero-title">
          <h2>{{ campaign.name }}</h2>
          <CampaignStatusTag :status="campaign.status" size="large" />
        </div>
        <div class="hero-actions">
          <AppleButton v-if="canStart" variant="primary" :disabled="loading" @click="emit('start')">
            {{ campaign.status === 'paused' ? '恢复启动' : '启动' }}
          </AppleButton>
          <AppleButton v-if="canPause" variant="warning" :disabled="loading" @click="emit('pause')">
            暂停
          </AppleButton>
          <AppleButton
            v-if="canComplete"
            variant="success"
            :disabled="loading"
            @click="emit('complete')"
          >
            结束
          </AppleButton>
          <AppleButton
            v-if="canCancel"
            variant="tinted"
            data-tone="danger"
            :disabled="loading"
            @click="emit('cancel')"
          >
            取消
          </AppleButton>
        </div>
      </div>
      <div class="hero-meta">
        <el-tag effect="plain" size="small">{{ typeLabel }}</el-tag>
        <span class="meta-item">
          {{ formatDate(campaign.startDate) }} ~ {{ formatDate(campaign.endDate) }}
        </span>
        <span class="meta-item">覆盖 {{ campaign.areaIds?.length ?? 0 }} 个区域</span>
        <span class="meta-item">关联 {{ campaign.merchantIds?.length ?? 0 }} 个商家</span>
        <span v-if="campaign.ownerId" class="meta-item">
          负责人
          <span class="mono">{{ campaign.ownerId }}</span>
        </span>
      </div>
      <p v-if="campaign.description" class="hero-desc">{{ campaign.description }}</p>
      <!-- Residual #254: form/API already write+return scope ids; surface on detail (not just count). -->
      <div class="hero-scope">
        <div class="scope-row">
          <span class="scope-label">覆盖区域</span>
          <template v-if="campaign.areaIds?.length">
            <el-tag
              v-for="areaId in campaign.areaIds"
              :key="`area-${areaId}`"
              size="small"
              effect="plain"
              class="scope-tag"
            >
              {{ areaId }}
            </el-tag>
          </template>
          <span v-else class="scope-empty">未绑定区域</span>
        </div>
        <div class="scope-row">
          <span class="scope-label">关联商家</span>
          <template v-if="campaign.merchantIds?.length">
            <el-tag
              v-for="merchantId in campaign.merchantIds"
              :key="`merchant-${merchantId}`"
              size="small"
              effect="plain"
              class="scope-tag"
            >
              {{ merchantId }}
            </el-tag>
          </template>
          <span v-else class="scope-empty">未绑定商家</span>
        </div>
      </div>
      <el-row :gutter="16" class="hero-metrics">
        <el-col :xs="12" :sm="8">
          <el-statistic title="活动预算" :value="displayMoney(campaign, 'budget')" />
        </el-col>
        <el-col :xs="12" :sm="8">
          <el-statistic title="目标 GMV" :value="displayMoney(campaign, 'targetGmv')" />
        </el-col>
        <el-col :xs="12" :sm="8">
          <el-statistic title="目标订单" :value="formatCount(campaign.targetOrders)" />
        </el-col>
      </el-row>
    </template>
    <el-empty v-else-if="!loading" description="活动不存在或已删除" />
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MarketingCampaign } from '@content/shared';
import AppleButton from '../../../components/AppleButton.vue';
import { CAMPAIGN_TYPE_LABELS } from '../composables/useCampaigns';
import CampaignStatusTag from './CampaignStatusTag.vue';
import { displayMoney, formatCount } from '../../../utils/format';

const props = withDefaults(
  defineProps<{
    campaign: MarketingCampaign | null;
    loading?: boolean;
  }>(),
  { loading: false }
);

const emit = defineEmits<{
  start: [];
  pause: [];
  complete: [];
  cancel: [];
}>();

const typeLabel = computed(() => {
  if (!props.campaign) return '-';
  return CAMPAIGN_TYPE_LABELS[props.campaign.campaignType] ?? props.campaign.campaignType;
});

const canStart = computed(
  () => props.campaign?.status === 'draft' || props.campaign?.status === 'paused'
);
const canPause = computed(() => props.campaign?.status === 'active');
const canComplete = computed(
  () => props.campaign?.status === 'active' || props.campaign?.status === 'paused'
);
const canCancel = computed(() =>
  ['draft', 'active', 'paused'].includes(props.campaign?.status ?? '')
);

function formatDate(value?: string): string {
  return value ? value.slice(0, 10) : '—';
}
</script>

<style scoped>
.campaign-hero {
  margin-bottom: 20px;
}

.hero-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}

.hero-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.hero-title h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
}

.hero-actions {
  display: flex;
  gap: 8px;
}

.hero-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin-bottom: 8px;
}

.hero-desc {
  margin: 0 0 8px;
  color: var(--el-text-color-regular);
  font-size: 13px;
}

.hero-scope {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 4px 0 8px;
}

.scope-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 13px;
}

.scope-label {
  color: var(--el-text-color-secondary);
  min-width: 64px;
}

.scope-tag {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scope-empty {
  color: var(--el-text-color-placeholder);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}

.hero-metrics {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>
