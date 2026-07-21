<template>
  <section class="panel" :class="{ 'ops-section-danger': danger }">
    <SectionHeader :title="title" :description="subtitle">
      <template #actions><slot name="actions" /></template>
    </SectionHeader>
    <OperationSectionCards
      v-if="items.length"
      :items="items"
      @open="$emit('open', $event)"
      @generate="$emit('generate', $event)"
    />
    <EmptyState
      v-else
      icon="空"
      :title="emptyText"
      description="系统会随 JeeSite 数据刷新自动更新"
    />
  </section>
</template>
<script setup lang="ts">
import type { OperationCard } from '@content/shared';
import EmptyState from './EmptyState.vue';
import SectionHeader from './SectionHeader.vue';
import OperationSectionCards from './OperationSectionCards.vue';
defineProps<{
  title: string;
  subtitle?: string;
  items: OperationCard[];
  emptyText: string;
  danger?: boolean;
}>();
defineEmits<{ open: [packageId: string]; generate: [packageId: string] }>();
</script>
<style src="../styles/components/operation-section.css" scoped></style>
