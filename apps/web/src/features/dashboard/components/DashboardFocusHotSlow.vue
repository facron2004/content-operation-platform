<template>
  <div v-if="['all', 'hot', 'slow'].includes(activeFocus)" class="ops-grid">
    <OperationSection
      v-if="activeFocus === 'all' || activeFocus === 'hot'"
      title="今日爆品机会"
      subtitle="适合放大曝光和重点推送"
      empty-text="暂无爆品机会"
      :items="consoleData.hotOpportunities ?? []"
      @open="$emit('open', $event)"
      @generate="$emit('generate', $event)"
    />
    <OperationSection
      v-if="activeFocus === 'all' || activeFocus === 'slow'"
      title="今日滞销套餐"
      subtitle="需要通过定价、话术或社群动作提振"
      empty-text="暂无滞销套餐"
      :items="consoleData.slowMovingPackages ?? []"
      danger
      @open="$emit('open', $event)"
      @generate="$emit('generate', $event)"
    />
  </div>
</template>
<script setup lang="ts">
import type { OperationConsoleData } from '../composables/useDashboard';
import OperationSection from '../../../components/OperationSection.vue';
defineProps<{ activeFocus: string; consoleData: OperationConsoleData }>();
defineEmits<{ open: [packageId: string]; generate: [packageId: string] }>();
</script>
