<script setup lang="ts">
import type { GeneratedCopy } from '@content/shared';
import { channelLabels } from '../utils/labels';
import AppleButton from './AppleButton.vue';
defineProps<{ copy: GeneratedCopy; riskTagType: (level: GeneratedCopy['riskLevel']) => string }>();
defineEmits<{ copy: [copy: GeneratedCopy] }>();
</script>
<template>
  <article class="copy-item">
    <div class="copy-head">
      <strong>{{ copy.copyVersion }} / {{ channelLabels[copy.channel] }}</strong>
      <el-tag :type="riskTagType(copy.riskLevel)">{{ copy.riskLevel }}</el-tag>
    </div>
    <h3>{{ copy.title }}</h3>
    <p>{{ copy.body }}</p>
    <div v-if="copy.riskTips?.length" class="copy-risk">
      <el-tag v-for="tip in copy.riskTips.slice(0, 2)" :key="tip" type="warning" effect="plain">
        {{ tip }}
      </el-tag>
    </div>
    <div class="copy-actions">
      <AppleButton size="sm" variant="secondary" @click="$emit('copy', copy)">复制</AppleButton>
      <AppleButton size="sm" variant="primary" @click="$router.push('/audit')">
        提交审核
      </AppleButton>
    </div>
  </article>
</template>
