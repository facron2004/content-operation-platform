<template>
  <el-dropdown trigger="click" @command="$emit('backfill', $event)">
    <span class="backfill-trigger-wrap">
      <el-button size="small" :loading="backfilling" data-testid="gmv-backfill">
        {{ backfillLabel }}
        <el-icon class="el-icon--right"><ArrowDown /></el-icon>
      </el-button>
    </span>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item :command="1">重抓最近 1 天</el-dropdown-item>
        <el-dropdown-item :command="3">重抓最近 3 天</el-dropdown-item>
        <el-dropdown-item :command="7">重抓最近 7 天</el-dropdown-item>
        <el-dropdown-item :command="14">重抓最近 14 天</el-dropdown-item>
        <el-dropdown-item :command="30">重抓最近 30 天</el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>
<script setup lang="ts">
import { ArrowDown } from '@element-plus/icons-vue';
defineProps<{ backfilling: boolean; backfillLabel: string }>();
defineEmits<{ backfill: [days: number] }>();
</script>
<style scoped>
.backfill-trigger-wrap {
  display: inline-flex;
  line-height: 1;
}
</style>
