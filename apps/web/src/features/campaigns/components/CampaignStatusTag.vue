<template>
  <el-tag :type="tagType" :size="size" effect="light" class="campaign-status-tag">
    {{ label }}
  </el-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { MarketingCampaign } from '@content/shared';
import { CAMPAIGN_STATUS_LABELS } from '../composables/useCampaigns';

type TagType = 'primary' | 'success' | 'info' | 'warning' | 'danger';

const props = withDefaults(
  defineProps<{
    status: string;
    size?: 'large' | 'default' | 'small';
  }>(),
  { size: 'default' }
);

// Note: Element Plus 2.x el-tag has no "default" type; "info" renders the neutral gray style.
const STATUS_TAG_TYPES: Record<MarketingCampaign['status'], TagType> = {
  draft: 'info',
  active: 'success',
  paused: 'warning',
  completed: 'info',
  cancelled: 'danger'
};

const tagType = computed<TagType>(
  () => STATUS_TAG_TYPES[props.status as MarketingCampaign['status']] ?? 'info'
);
const label = computed(
  () =>
    CAMPAIGN_STATUS_LABELS[props.status as MarketingCampaign['status']] ?? props.status ?? '未知'
);
</script>

<style scoped>
.campaign-status-tag {
  font-weight: 500;
}
</style>
