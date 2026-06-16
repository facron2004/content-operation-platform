<template>
  <section class="panel">
    <div class="panel-head">
      <h2>昨日运营复盘</h2>
      <el-button text type="primary" @click="$emit('navigate', '/performance')">效果看板</el-button>
    </div>
    <div class="review-list">
      <p v-for="item in review?.whatHappened ?? []" :key="item">{{ item }}</p>
    </div>
    <div class="suggestion-list">
      <strong>明日建议</strong>
      <span v-for="item in review?.tomorrowSuggestions ?? []" :key="item">{{ item }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  review?: { date: string; whatHappened: string[]; tomorrowSuggestions: string[] };
}>();

defineEmits<{
  navigate: [path: string];
}>();
</script>

<style scoped>
.review-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
}

.review-list p {
  padding: 10px 14px;
  border-left: 3px solid #3b82f6;
  border-radius: 4px;
  background: #eff6ff;
  color: var(--ink);
  line-height: 1.5;
}

.suggestion-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.suggestion-list strong {
  margin-bottom: 4px;
  color: var(--ink);
}

.suggestion-list span {
  padding: 8px 12px;
  border-radius: 6px;
  background: #f4f7fb;
  color: var(--ink);
  line-height: 1.5;
}
</style>
