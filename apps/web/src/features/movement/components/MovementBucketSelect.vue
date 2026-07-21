<script setup lang="ts">
import type { StaleBucket } from '../composables/useMovementList';
defineProps<{ buckets: StaleBucket[]; labels: Record<string, string> }>();
const model = defineModel<StaleBucket>({ required: true });
defineEmits<{ change: [] }>();
</script>
<template>
  <el-select v-model="model" size="small" style="width: 140px" @change="$emit('change')">
    <el-option v-for="b in buckets" :key="b" :label="labels[b]" :value="b" />
  </el-select>
</template>
