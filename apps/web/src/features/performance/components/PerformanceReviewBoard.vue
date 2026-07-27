<template>
  <section class="panel review-hero">
    <div class="panel-head hero-head">
      <div>
        <p class="eyebrow">Performance Review</p>
        <h2>AI 复盘建议</h2>
        <p class="hero-copy">把昨天、今天和明天连起来看，优先找出能直接影响转化的动作。</p>
      </div>
      <el-tag effect="plain" type="success">{{ review?.date || '最新复盘' }}</el-tag>
    </div>
    <div class="review-board">
      <article class="review-card">
        <span class="review-card-label">昨天发生了什么</span>
        <p v-for="item in review?.whatHappened ?? []" :key="item">{{ item }}</p>
      </article>
      <article class="review-card">
        <span class="review-card-label">明天建议推什么</span>
        <p v-for="item in review?.tomorrowSuggestions ?? []" :key="item">{{ item }}</p>
      </article>
      <article class="review-card review-card-highlight">
        <span class="review-card-label">高转化文案</span>
        <!-- Residual #282: Top-N high-conversion copy head honesty. -->
        <p v-if="review?.copyTruncated" class="list-cap-hint">
          仅展示转化率前 {{ review?.reviewListLimit ?? 5 }} 条（共
          {{ review?.copyMatched ?? 0 }} 条）
        </p>
        <p v-for="item in review?.highConversionCopies ?? []" :key="item.contentId">
          <strong>{{ item.title }}</strong>
          <span>{{ formatPercent(item.conversionRate) }}</span>
        </p>
      </article>
    </div>
  </section>
</template>
<script setup lang="ts">
import type { PerformanceResponse } from '@content/shared';
import { percent as formatPercent } from '../../../utils/labels';
defineProps<{ review: PerformanceResponse['review'] | null | undefined }>();
</script>
<style scoped>
.list-cap-hint {
  margin: 0 0 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
  font-size: 12px;
  line-height: 1.4;
}
</style>
