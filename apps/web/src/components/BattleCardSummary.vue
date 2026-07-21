<template>
  <div class="battle-card-summary">
    <strong>{{ battleCard.packageName }}</strong>
    <p>{{ battleCard.recommendationReason }}</p>
    <div class="tag-cloud">
      <el-tag v-for="channel in battleCard.suitableChannels" :key="channel" effect="plain">
        {{ channelLabels[channel] }}
      </el-tag>
      <el-tag type="success">建议 {{ battleCard.recommendedPushTime }}</el-tag>
    </div>
  </div>
  <div class="battle-card-block">
    <span>适合人群</span>
    <p>{{ battleCard.targetAudience.join('、') }}</p>
  </div>
  <div class="battle-card-block">
    <span>主推卖点</span>
    <p>{{ battleCard.mainSellingPoints.join('、') }}</p>
  </div>
</template>
<script setup lang="ts">
import type { BattleCard } from '@content/shared';
import { channelLabels } from '../utils/labels';
defineProps<{ battleCard: BattleCard }>();
</script>
