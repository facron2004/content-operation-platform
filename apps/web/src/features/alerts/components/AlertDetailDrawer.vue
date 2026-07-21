<template>
  <el-drawer v-model="visible" title="预警处理卡" size="440px" class="alert-drawer">
    <AlertDetailBody
      :alert="alert"
      @close="visible = false"
      @go-analysis="emit('go-analysis', $event)"
      @go-battle="emit('go-battle', $event)"
      @resolve="emit('resolve', $event)"
    />
  </el-drawer>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { OperationAlert } from '@content/shared';
import AlertDetailBody from './AlertDetailBody.vue';
const props = defineProps<{
  modelValue: boolean;
  alert: (OperationAlert & { priorityScore?: number }) | null;
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'go-analysis', packageId: string): void;
  (e: 'go-battle', packageId: string): void;
  (e: 'resolve', alertId: string): void;
}>();
const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
});
</script>
