<template>
  <section class="panel result-panel">
    <div class="panel-head">
      <h2>生成结果</h2>
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
.copy-risk {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
</style>
