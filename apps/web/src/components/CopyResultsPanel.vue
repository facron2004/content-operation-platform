<template>
  <section class="panel result-panel">
    <div class="panel-head">
      <div>
        <h2>生成结果</h2>
        <p>这里展示 AI 或规则兜底输出的文案，确认后可直接进入审核流。</p>
      </div>
      <el-button text type="primary" @click="$router.push('/audit')">去审核</el-button>
    </div>
    <div v-if="copies.length === 0" class="copy-list">
      <EmptyState
        icon="✍️"
        title="等待生成"
        description="AI 或规则兜底生成后的文案会在这里进入审核流"
      />
    </div>
    <div v-else class="copy-list">
      <CopyResultItem
        v-for="copy in copies"
        :key="copy.contentId"
        :copy="copy"
        :risk-tag-type="riskTagType"
        @copy="$emit('copy', $event)"
      />
    </div>
  </section>
</template>
<script setup lang="ts">
import type { GeneratedCopy } from '@content/shared';
import EmptyState from './EmptyState.vue';
import CopyResultItem from './CopyResultItem.vue';
defineProps<{
  copies: GeneratedCopy[];
  riskTagType: (level: GeneratedCopy['riskLevel']) => string;
}>();
defineEmits<{ copy: [copy: GeneratedCopy] }>();
</script>
<style src="../styles/components/copy-results-panel.css" scoped></style>
