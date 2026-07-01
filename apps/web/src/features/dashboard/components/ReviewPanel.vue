<template>
  <section class="panel dashboard-subpanel">
    <SectionHeader title="昨日运营复盘" description="把昨天的结果和明天的动作连在一起看。">
      <template #actions>
        <el-button text type="primary" @click="$emit('navigate', '/performance')">
          效果看板
        </el-button>
      </template>
    </SectionHeader>
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
import SectionHeader from '../../../components/SectionHeader.vue';

defineProps<{
  review?: { date: string; whatHappened: string[]; tomorrowSuggestions: string[] };
}>();

defineEmits<{
  navigate: [path: string];
}>();
</script>

<style scoped>
.panel-head h2 {
  margin: 0;
  color: var(--ink);
  font-size: 15px;
  font-weight: 800;
}

.panel-head p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.review-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
}

.review-list p {
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--ink);
  line-height: 1.55;
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
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--soft);
  color: var(--ink);
  line-height: 1.5;
}
</style>
