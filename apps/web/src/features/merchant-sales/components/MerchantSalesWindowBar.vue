<template>
  <div class="window-tabs panel">
    <el-radio-group v-model="windowSel" size="default" @change="$emit('change')">
      <el-radio-button value="day">日</el-radio-button>
      <el-radio-button value="week">周</el-radio-button>
      <el-radio-button value="month">月</el-radio-button>
      <el-radio-button value="year">年</el-radio-button>
    </el-radio-group>
    <div class="window-tabs__hint">
      <span v-if="summary">{{ windowLabel }}数据 · {{ windowRange }}</span>
      <el-tag v-else-if="!loading" type="info" size="small">暂无数据</el-tag>
    </div>
  </div>
</template>
<script setup lang="ts">
const windowSel = defineModel<string>({ required: true });
defineProps<{ summary: unknown; windowLabel: string; windowRange: string; loading: boolean }>();
defineEmits<{ change: [] }>();
</script>
