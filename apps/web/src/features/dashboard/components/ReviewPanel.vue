<template>
  <section class="panel dashboard-subpanel">
    <SectionHeader title="昨日运营复盘" description="把昨天的结果和明天的动作连在一起看。">
      <template #actions>
        <AppleButton variant="ghost" @click="$emit('navigate', '/performance')">
          效果看板
        </AppleButton>
      </template>
    </SectionHeader>
    <div class="review-list">
      <p v-for="item in review?.whatHappened ?? []" :key="item">{{ item }}</p>
    </div>
    <!-- Residual #282: good/weak Top-N list-head honesty (narrative already uses full matched). -->
    <p v-if="review?.goodTruncated || review?.weakTruncated" class="list-cap-hint">
      复盘套餐列表仅展示前 {{ review?.reviewListLimit ?? 5 }} 个
      <template v-if="review?.goodTruncated">（高分匹配 {{ review?.goodMatched ?? 0 }}）</template>
      <template v-if="review?.weakTruncated">
        （风险/滞销匹配 {{ review?.weakMatched ?? 0 }}）
      </template>
      ，其余未展开。
    </p>
    <!-- Residual #290: GeneratedCopy title-join honesty for high-conversion copy titles. -->
    <p v-if="titleJoinTruncated || (titleJoinMissed ?? 0) > 0" class="list-cap-hint">
      高转化文案标题仅关联最近 {{ titleJoinLimit ?? 500 }} 条文案（已加载
      {{ titleJoinLoaded ?? 0 }} 条
      <template v-if="(titleJoinMissed ?? 0) > 0">
        ，本页 {{ titleJoinMissed }} 条效果记录标题显示为「-」
      </template>
      ），更早文案未参与标题拼接。
    </p>
    <div class="suggestion-list">
      <strong>明日建议</strong>
      <span v-for="item in review?.tomorrowSuggestions ?? []" :key="item">{{ item }}</span>
    </div>
  </section>
</template>
<script setup lang="ts">
import SectionHeader from '../../../components/SectionHeader.vue';
import AppleButton from '../../../components/AppleButton.vue';
defineProps<{
  review?: {
    date: string;
    whatHappened: string[];
    tomorrowSuggestions: string[];
    reviewListLimit?: number;
    goodMatched?: number;
    goodTruncated?: boolean;
    weakMatched?: number;
    weakTruncated?: boolean;
  };
  // Residual #290: GeneratedCopy title-join honesty.
  titleJoinTruncated?: boolean;
  titleJoinLimit?: number;
  titleJoinLoaded?: number;
  titleJoinMissed?: number;
}>();
defineEmits<{ navigate: [path: string] }>();
</script>
<style src="../../../styles/components/review-panel.css" scoped></style>
