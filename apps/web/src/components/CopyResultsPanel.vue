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
      <article v-for="copy in copies" :key="copy.contentId" class="copy-item">
        <div class="copy-head">
          <strong>{{ copy.copyVersion }} / {{ channelLabels[copy.channel] }}</strong>
          <el-tag :type="riskTagType(copy.riskLevel)">
            {{ copy.riskLevel }}
          </el-tag>
        </div>
        <h3>{{ copy.title }}</h3>
        <p>{{ copy.body }}</p>
        <div v-if="copy.riskTips?.length" class="copy-risk">
          <el-tag v-for="tip in copy.riskTips.slice(0, 2)" :key="tip" type="warning" effect="plain">
            {{ tip }}
          </el-tag>
        </div>
        <div class="copy-actions">
          <el-button size="small" :icon="CopyDocument" @click="$emit('copy', copy)">复制</el-button>
          <el-button size="small" type="primary" @click="$router.push('/audit')">
            提交审核
          </el-button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { CopyDocument } from '@element-plus/icons-vue';
import type { GeneratedCopy } from '@content/shared';
import { channelLabels } from '../utils/labels';
import EmptyState from './EmptyState.vue';

defineProps<{
  copies: GeneratedCopy[];
  riskTagType: (level: GeneratedCopy['riskLevel']) => string;
}>();

defineEmits<{
  copy: [copy: GeneratedCopy];
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

.copy-list {
  display: grid;
  gap: 10px;
}

.copy-item {
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--panel);
  box-shadow: var(--shadow-soft);
}

.copy-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.copy-item h3 {
  margin: 10px 0 0;
  color: var(--ink);
  font-size: 15px;
  line-height: 1.4;
}

.copy-item p {
  margin: 10px 0 0;
  color: var(--ink-soft);
  line-height: 1.7;
  white-space: pre-wrap;
}

.copy-risk {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.copy-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
</style>
