<template>
  <SectionHeader title="待处理预警" description="先处理高优先级项，再批量收口当前页。">
    <template #actions>
      <span class="muted-cell">共 {{ total }} 条，当前页 {{ pageCount }} 条</span>
      <AppleButton
        v-if="canResolve"
        variant="success"
        :disabled="!pageCount"
        :loading="resolving"
        @click="$emit('resolve-page')"
      >
        一键处理当前页
      </AppleButton>
    </template>
  </SectionHeader>
  <div class="page-summary">
    <span>高危 {{ currentPageDangerCount }}</span>
    <span>警告 {{ currentPageWarningCount }}</span>
    <span>平均优先级 {{ currentPageAvgScore }}</span>
    <span>涉及套餐 {{ currentPagePackageCount }}</span>
  </div>
</template>
<script setup lang="ts">
import AppleButton from '../../../components/AppleButton.vue';
import SectionHeader from '../../../components/SectionHeader.vue';
defineProps<{
  total: number;
  pageCount: number;
  resolving: boolean;
  canResolve: boolean;
  currentPageDangerCount: number;
  currentPageWarningCount: number;
  currentPageAvgScore: number | string;
  currentPagePackageCount: number;
}>();
defineEmits<{ 'resolve-page': [] }>();
</script>
