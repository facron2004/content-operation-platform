<template>
  <section v-if="selectedPackage" class="panel battle-card-panel">
    <div class="panel-head">
      <h2>套餐推广作战卡</h2>
      <el-button type="primary" :loading="battleCardLoading" @click="$emit('generate')">
        生成作战卡
      </el-button>
    </div>
    <div v-if="battleCard" class="battle-card-grid">
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
      <div class="battle-copy">
        <h3>社群文案</h3>
        <p>{{ battleCard.communityCopy }}</p>
      </div>
      <div class="battle-copy">
        <h3>朋友圈文案</h3>
        <p>{{ battleCard.momentsCopy }}</p>
      </div>
      <div class="battle-copy">
        <h3>商家转发文案</h3>
        <p>{{ battleCard.merchantShareCopy }}</p>
      </div>
      <div class="battle-copy">
        <h3>二次跟进</h3>
        <p>{{ battleCard.followUpCopy }}</p>
      </div>
      <div class="battle-copy">
        <h3>售罄承接</h3>
        <p>{{ battleCard.soldOutFallbackCopy }}</p>
      </div>
    </div>
    <EmptyState
      v-else
      icon="卡"
      title="等待生成作战卡"
      description="作战卡会一次生成推荐原因、人群、渠道、推送时间和多场景文案"
    />
  </section>
</template>

<script setup lang="ts">
import type { BattleCard, RecommendPackageItem } from '@content/shared';
import { channelLabels } from '../utils/labels';
import EmptyState from './EmptyState.vue';

defineProps<{
  selectedPackage: RecommendPackageItem | undefined;
  battleCard: BattleCard | null;
  battleCardLoading: boolean;
}>();

defineEmits<{
  generate: [];
}>();
</script>

<style scoped>
.battle-card-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.battle-card-summary,
.battle-card-block,
.battle-copy {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.battle-card-summary {
  grid-column: span 3;
}

.battle-card-summary p,
.battle-card-block p,
.battle-copy p {
  margin: 8px 0 0;
  color: var(--muted);
  line-height: 1.55;
  white-space: pre-line;
}

.battle-card-block span {
  color: var(--muted);
  font-size: 12px;
}

.battle-copy h3 {
  margin: 0;
  font-size: 15px;
}
</style>
