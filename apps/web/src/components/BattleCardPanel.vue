<template>
  <section v-if="selectedPackage" class="panel battle-card-panel">
    <SectionHeader
      title="套餐推广作战卡"
      description="把推荐理由、人群、渠道和多场景文案一次性整理好。"
    >
      <template #actions>
        <el-button type="primary" :loading="battleCardLoading" @click="$emit('generate')">
          生成作战卡
        </el-button>
      </template>
    </SectionHeader>
    <div v-if="battleCard" class="battle-card-grid">
      <BattleCardSummary :battle-card="battleCard" />
      <BattleCardCopies :battle-card="battleCard" />
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
import EmptyState from './EmptyState.vue';
import SectionHeader from './SectionHeader.vue';
import BattleCardSummary from './BattleCardSummary.vue';
import BattleCardCopies from './BattleCardCopies.vue';
defineProps<{
  selectedPackage: RecommendPackageItem | undefined;
  battleCard: BattleCard | null;
  battleCardLoading: boolean;
}>();
defineEmits<{ generate: [] }>();
</script>
<style src="../styles/components/battle-card-panel.css" scoped></style>
