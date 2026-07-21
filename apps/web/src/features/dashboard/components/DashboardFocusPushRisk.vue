<template>
  <div v-if="['all', 'push', 'risk'].includes(activeFocus)" class="ops-grid">
    <OperationSection
      v-if="activeFocus === 'all' || activeFocus === 'push'"
      title="今日必推"
      subtitle="优先级最高，适合直接推动转化"
      empty-text="暂无必推套餐"
      :items="consoleData.mustPushPackages ?? []"
      @open="$emit('open', $event)"
      @generate="$emit('generate', $event)"
    />
    <OperationSection
      v-if="activeFocus === 'all' || activeFocus === 'risk'"
      title="今日风险套餐"
      subtitle="需要尽快止损、复核或安排补救"
      empty-text="暂无风险套餐"
      :items="consoleData.riskPackages ?? []"
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
