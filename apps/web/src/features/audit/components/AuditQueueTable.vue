<template>
  <el-table
    :data="copies"
    height="650"
    highlight-current-row
    @current-change="(row: GeneratedCopy | undefined) => row && $emit('select', row)"
  >
    <el-table-column prop="copyVersion" label="版本" width="70" />
    <el-table-column prop="title" label="标题" min-width="190" show-overflow-tooltip />
    <el-table-column label="渠道" width="100">
      <template #default="{ row }">{{ channelLabels[row.channel] }}</template>
    </el-table-column>
    <el-table-column prop="riskLevel" label="风险" width="86" />
    <el-table-column prop="auditStatus" label="状态" width="100" />
    <template #empty>
      <EmptyState
        icon="✅"
        title="暂无待审核文案"
        description="当前状态下没有文案需要处理"
        action-text="去生成文案"
        @action="$router.push('/generate')"
      />
    </template>
  </el-table>
</template>
<script setup lang="ts">
import type { GeneratedCopy } from '@content/shared';
import EmptyState from '../../../components/EmptyState.vue';
defineProps<{ copies: GeneratedCopy[]; channelLabels: Record<string, string> }>();
defineEmits<{ select: [row: GeneratedCopy] }>();
</script>
