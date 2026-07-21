<template>
  <div>
    <div class="feed-facts">
      <div v-for="item in feedFacts" :key="item.label" class="feed-fact">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
      </div>
    </div>
    <div class="quality-strip">
      <div
        v-for="item in feedChecks"
        :key="item.label"
        class="quality-check"
        :class="{ ok: item.ok }"
      >
        <span>{{ item.label }}</span>
        <strong>{{ item.text }}</strong>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
defineProps<{
  feedFacts: Array<{ label: string; value: string }>;
  feedChecks: Array<{ label: string; ok: boolean; text: string }>;
}>();
</script>
