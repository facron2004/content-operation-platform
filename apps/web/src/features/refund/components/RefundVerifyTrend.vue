<script setup lang="ts">
defineProps<{ activeTab: string; trendDays: 7 | 30; trendOption: unknown }>();
defineEmits<{ 'update:trendDays': [value: 7 | 30]; change: [] }>();
</script>
<template>
  <section class="panel chart-card">
    <header>
      <h3>{{ activeTab === 'refund' ? '退款率' : '核销率' }} 7/30 日趋势</h3>
      <el-radio-group
        :model-value="trendDays"
        size="small"
        @update:model-value="$emit('update:trendDays', Number($event) === 30 ? 30 : 7)"
        @change="$emit('change')"
      >
        <el-radio-button :value="7">7 日</el-radio-button>
        <el-radio-button :value="30">30 日</el-radio-button>
      </el-radio-group>
    </header>
    <slot />
  </section>
</template>
