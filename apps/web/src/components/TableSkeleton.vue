<template>
  <div class="table-skeleton">
    <div v-for="i in rows" :key="i" class="skeleton-row">
      <div v-for="j in columns" :key="j" class="skeleton-cell">
        <div class="skeleton-line" :style="{ width: getWidth(j) }"></div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
const { rows, columns } = withDefaults(defineProps<{ rows?: number; columns?: number }>(), {
  rows: 5,
  columns: 6
});
const getWidth = (index: number) => ['60%', '80%', '70%', '90%', '75%', '85%'][index % 6];
</script>
<style src="../styles/components/table-skeleton.css" scoped></style>
