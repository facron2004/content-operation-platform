<template>
  <div class="window-tabs ms-window-bar">
    <el-radio-group
      v-model="windowSel"
      size="default"
      class="ms-segment"
      @change="$emit('change')"
    >
      <el-radio-button value="day">日</el-radio-button>
      <el-radio-button value="week">周</el-radio-button>
      <el-radio-button value="month">月</el-radio-button>
      <el-radio-button value="year">年</el-radio-button>
    </el-radio-group>
    <div class="window-tabs__hint">
      <span v-if="summary" class="ms-window-meta">{{ windowLabel }}数据 · {{ windowRange }}</span>
      <span v-else-if="!loading" class="ms-pill ms-pill--muted">暂无数据</span>
    </div>
  </div>
</template>
<script setup lang="ts">
const windowSel = defineModel<string>({ required: true });
defineProps<{ summary: unknown; windowLabel: string; windowRange: string; loading: boolean }>();
defineEmits<{ change: [] }>();
</script>
