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
defineProps<{ review?: { date: string; whatHappened: string[]; tomorrowSuggestions: string[] } }>();
defineEmits<{ navigate: [path: string] }>();
</script>
<style src="../../../styles/components/review-panel.css" scoped></style>
