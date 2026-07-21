<template>
  <GenerateHeroBanner :package-name="packageName" :mode-label="modeLabel" :copy-count="copyCount" />
  <GenerateWorkflowStrip :steps="steps" />
</template>
<script setup lang="ts">
import GenerateHeroBanner from './GenerateHeroBanner.vue';
import GenerateWorkflowStrip from './GenerateWorkflowStrip.vue';
defineProps<{
  packageName?: string;
  modeLabel: string;
  copyCount: number;
  steps: Array<{
    key: string;
    index: number | string;
    label: string;
    description: string;
    state?: string;
  }>;
}>();
</script>
